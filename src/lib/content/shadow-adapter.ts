/**
 * ShadowContentAdapter — wraps two ContentRepository adapters and compares outputs.
 *
 * The PRIMARY adapter's result is ALWAYS returned to the caller.
 * The SECONDARY adapter is run concurrently (shadowed) for comparison only and
 * NEVER affects correctness or throws from the shadow path.
 *
 * Use-case: validate that a DB adapter (secondary) matches the filesystem
 * oracle (primary) before cutover, without risking any production request.
 *
 * Deep-equal approach: recursive structural equality with sorted-key comparison
 * on plain objects (no circular references, no functions, no Dates in content
 * layer return types — plain JSON-safe data throughout). Cheaper than
 * JSON.stringify and handles `undefined` fields naturally.
 *
 * Divergence entry shape:
 *   { method, kind: "divergence" | "order" | "error", detail?, message? }
 *
 *   - "divergence": a content or structural mismatch (total/totalPages, slug
 *     set, field value, or deep-equal failure on aggregate results)
 *   - "order": all content matches but the sequence of items differs; the DB
 *     intentionally adds a deterministic id tiebreak where the filesystem
 *     order on equal published_at is OS-dependent
 *   - "error": secondary adapter threw or rejected
 */

import type {
  ContentRepository,
  ListPostsOptions,
  ListPostsResult,
  ListPagesOptions,
  ListPagesResult,
  StatusCounts,
} from "./ports";
import type { Category, Page, Post, SiteConfig, Tag } from "./types";
import type { LinkGraph, UnlinkedMention } from "./links";

// ---------------------------------------------------------------------------
// Public divergence type
// ---------------------------------------------------------------------------

export interface ShadowDivergence {
  method: string;
  kind: "divergence" | "order" | "error";
  /** Human-readable detail for divergence/order entries. */
  detail?: string;
  /** Error message for error entries. */
  message?: string;
}

// ---------------------------------------------------------------------------
// Default log — writes to console.warn with a stable prefix and compact JSON
// ---------------------------------------------------------------------------

function defaultLog(entry: ShadowDivergence): void {
  console.warn("[content:shadow] " + JSON.stringify(entry));
}

// ---------------------------------------------------------------------------
// Deep-equal — recursive structural equality
//
// Handles: primitives, null, arrays, plain objects.
// Not suitable for: Date, Map, Set, RegExp, or circular structures — none of
// which appear in ContentRepository return types.
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // One is null, the other is not (a === b handles null===null above)
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  // Non-object primitives already handled by a === b above
  if (typeof a !== "object") return false;

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;

  if (aIsArray) {
    const aArr = a as unknown[];
    const bArr = b as unknown[];
    if (aArr.length !== bArr.length) return false;
    for (let i = 0; i < aArr.length; i++) {
      if (!deepEqual(aArr[i], bArr[i])) return false;
    }
    return true;
  }

  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec).sort();
  const bKeys = Object.keys(bRec).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const k of aKeys) {
    if (!deepEqual(aRec[k], bRec[k])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// String-array normalization
//
// Post.tags and Post.categories are semantically unordered sets. The FS
// adapter returns them in YAML frontmatter order; the DB adapter returns them
// in JOIN order (undefined without ORDER BY). Sorting before comparing detects
// real CONTENT differences while treating element-ordering as kind:"order".
//
// Only flat string arrays are sorted — nested objects, mixed-type arrays, or
// arrays of objects (e.g. GraphNode[]) are left unchanged.
// ---------------------------------------------------------------------------

function sortedIfStringArray(val: unknown): unknown {
  if (!Array.isArray(val)) return val;
  if (val.every((v) => typeof v === "string")) {
    return [...(val as string[])].sort();
  }
  return val;
}

/**
 * Normalise a Post (or null) for comparison by sorting any string array fields
 * (tags, categories) so that element-ordering differences don't produce false
 * positives. Other fields are left unchanged.
 */
function normalizePostForComparison(post: Post | null): Post | null {
  if (!post) return null;
  return {
    ...post,
    tags: [...post.tags].sort(),
    categories: [...post.categories].sort(),
  };
}

// ---------------------------------------------------------------------------
// diffListing — compare listPosts / listPages results
//
// 1. Compare total and totalPages (exact mismatch → divergence).
// 2. Compare the SET of slugs (missing/extra → divergence).
// 3. For slugs present in both, compare fields individually (mismatch → divergence).
//    String array fields (tags, categories) are compared as sets — same elements
//    in different order → kind:"order", not kind:"divergence".
// 4. If all content matches, compare order (differs → kind:"order").
// ---------------------------------------------------------------------------

function diffListing<T extends { slug: string }>(
  method: string,
  primary: { items: T[]; total: number; totalPages: number },
  secondary: { items: T[]; total: number; totalPages: number },
  emit: (d: ShadowDivergence) => void
): void {
  let contentMismatch = false;

  if (primary.total !== secondary.total) {
    emit({
      method,
      kind: "divergence",
      detail: `total: primary=${primary.total} secondary=${secondary.total}`,
    });
    contentMismatch = true;
  }

  if (primary.totalPages !== secondary.totalPages) {
    emit({
      method,
      kind: "divergence",
      detail: `totalPages: primary=${primary.totalPages} secondary=${secondary.totalPages}`,
    });
    contentMismatch = true;
  }

  const primarySlugs = primary.items.map((x) => x.slug);
  const secondarySlugs = secondary.items.map((x) => x.slug);
  const primarySlugSet = new Set(primarySlugs);
  const secondarySlugSet = new Set(secondarySlugs);
  const secondaryBySlug = new Map(secondary.items.map((x) => [x.slug, x]));

  for (const slug of primarySlugSet) {
    if (!secondarySlugSet.has(slug)) {
      emit({ method, kind: "divergence", detail: `slug missing-in-secondary: "${slug}"` });
      contentMismatch = true;
    }
  }
  for (const slug of secondarySlugSet) {
    if (!primarySlugSet.has(slug)) {
      emit({ method, kind: "divergence", detail: `slug extra-in-secondary: "${slug}"` });
      contentMismatch = true;
    }
  }

  // Field-by-field comparison for slugs present in both
  for (const primaryItem of primary.items) {
    const secondaryItem = secondaryBySlug.get(primaryItem.slug);
    if (!secondaryItem) continue; // already reported as missing

    const pRec = primaryItem as Record<string, unknown>;
    const sRec = secondaryItem as Record<string, unknown>;
    // Compare the union of fields so extra fields in secondary are also caught
    const allFields = new Set([...Object.keys(pRec), ...Object.keys(sRec)]);

    for (const field of allFields) {
      const pVal = pRec[field];
      const sVal = sRec[field];
      if (!deepEqual(pVal, sVal)) {
        // String array fields (e.g. tags, categories) are semantically unordered
        // sets. Treat element-order differences as kind:"order", not divergence.
        if (
          Array.isArray(pVal) && Array.isArray(sVal) &&
          (pVal as unknown[]).every((v) => typeof v === "string") &&
          (sVal as unknown[]).every((v) => typeof v === "string") &&
          deepEqual(sortedIfStringArray(pVal), sortedIfStringArray(sVal))
        ) {
          emit({
            method,
            kind: "order",
            detail: `slug=${primaryItem.slug} field=${field}: string array order differs (content equal)`,
          });
          // Not a content mismatch — do not set contentMismatch
        } else {
          emit({
            method,
            kind: "divergence",
            detail: `slug=${primaryItem.slug} field=${field}: primary=${JSON.stringify(pVal)} secondary=${JSON.stringify(sVal)}`,
          });
          contentMismatch = true;
        }
      }
    }
  }

  // Order check — only emit when content is fully equal
  if (!contentMismatch) {
    const orderMatch = primarySlugs.length === secondarySlugs.length &&
      primarySlugs.every((slug, i) => slug === secondarySlugs[i]);
    if (!orderMatch) {
      emit({ method, kind: "order", detail: "slug order differs" });
    }
  }
}

// ---------------------------------------------------------------------------
// diffTagSet — compare listTags / listCategories results
//
// Same logic as diffListing but for flat arrays keyed by slug (no total/totalPages).
// ---------------------------------------------------------------------------

function diffTagSet<T extends { slug: string }>(
  method: string,
  primary: T[],
  secondary: T[],
  emit: (d: ShadowDivergence) => void
): void {
  let contentMismatch = false;

  const primarySlugs = primary.map((x) => x.slug);
  const secondarySlugs = secondary.map((x) => x.slug);
  const primarySlugSet = new Set(primarySlugs);
  const secondarySlugSet = new Set(secondarySlugs);
  const secondaryBySlug = new Map(secondary.map((x) => [x.slug, x]));

  for (const slug of primarySlugSet) {
    if (!secondarySlugSet.has(slug)) {
      emit({ method, kind: "divergence", detail: `slug missing-in-secondary: "${slug}"` });
      contentMismatch = true;
    }
  }
  for (const slug of secondarySlugSet) {
    if (!primarySlugSet.has(slug)) {
      emit({ method, kind: "divergence", detail: `slug extra-in-secondary: "${slug}"` });
      contentMismatch = true;
    }
  }

  for (const primaryItem of primary) {
    const secondaryItem = secondaryBySlug.get(primaryItem.slug);
    if (!secondaryItem) continue;

    const pRec = primaryItem as Record<string, unknown>;
    const sRec = secondaryItem as Record<string, unknown>;
    const allFields = new Set([...Object.keys(pRec), ...Object.keys(sRec)]);

    for (const field of allFields) {
      if (!deepEqual(pRec[field], sRec[field])) {
        emit({
          method,
          kind: "divergence",
          detail: `slug=${primaryItem.slug} field=${field}: primary=${JSON.stringify(pRec[field])} secondary=${JSON.stringify(sRec[field])}`,
        });
        contentMismatch = true;
      }
    }
  }

  if (!contentMismatch) {
    const orderMatch = primarySlugs.length === secondarySlugs.length &&
      primarySlugs.every((slug, i) => slug === secondarySlugs[i]);
    if (!orderMatch) {
      emit({ method, kind: "order", detail: "slug order differs" });
    }
  }
}

// ---------------------------------------------------------------------------
// Link-graph normalisation — sort arrays for order-independent comparison
//
// A link graph is conceptually a set of nodes and a set of edges. The two
// adapters may return the same graph content in different array orders because
// they read content from different sources (filesystem directory listing vs.
// SQL without ORDER BY). Sorting before comparing catches real content
// differences while ignoring ordering artifacts.
//
// If after normalisation the graphs are identical, no divergence is emitted.
// If they differ even after normalisation, a "divergence" entry is emitted.
// This is strictly stronger than a deep-equal check on unsorted arrays (which
// would produce false positives for identical graphs in different orders).
// ---------------------------------------------------------------------------

function normalizeLinkGraph(g: LinkGraph): LinkGraph {
  return {
    nodes: [...g.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...g.edges].sort((a, b) =>
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to) ||
      a.kind.localeCompare(b.kind)
    ),
    broken: [...g.broken].sort((a, b) =>
      a.from.localeCompare(b.from) || a.target.localeCompare(b.target)
    ),
  };
}

// ---------------------------------------------------------------------------
// Helper: extract error message from a settled rejection reason
// ---------------------------------------------------------------------------

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

// ---------------------------------------------------------------------------
// ShadowContentAdapter
// ---------------------------------------------------------------------------

export class ShadowContentAdapter implements ContentRepository {
  private readonly primary: ContentRepository;
  private readonly secondary: ContentRepository;
  private readonly _log: (entry: ShadowDivergence) => void;

  constructor(
    primary: ContentRepository,
    secondary: ContentRepository,
    options?: { log?: (entry: ShadowDivergence) => void }
  ) {
    this.primary = primary;
    this.secondary = secondary;
    this._log = options?.log ?? defaultLog;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // listPosts
  // ─────────────────────────────────────────────────────────────────────────

  async listPosts(options?: ListPostsOptions): Promise<ListPostsResult> {
    const method = "listPosts";
    const [p, s] = await Promise.allSettled([
      this.primary.listPosts(options),
      this.secondary.listPosts(options),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    diffListing(
      method,
      { items: primary.posts, total: primary.total, totalPages: primary.totalPages },
      { items: s.value.posts, total: s.value.total, totalPages: s.value.totalPages },
      this._log
    );
    return primary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getPost
  // ─────────────────────────────────────────────────────────────────────────

  async getPost(slug: string, options?: ListPostsOptions): Promise<Post | null> {
    const method = "getPost";
    const [p, s] = await Promise.allSettled([
      this.primary.getPost(slug, options),
      this.secondary.getPost(slug, options),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    // Normalise string array fields (tags, categories) before comparing so
    // element-ordering differences do not produce false-positive divergences.
    if (!deepEqual(normalizePostForComparison(primary), normalizePostForComparison(s.value))) {
      this._log({ method, kind: "divergence", detail: `slug=${slug}: values differ` });
    }
    return primary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // listPages
  // ─────────────────────────────────────────────────────────────────────────

  async listPages(options?: ListPagesOptions): Promise<ListPagesResult> {
    const method = "listPages";
    const [p, s] = await Promise.allSettled([
      this.primary.listPages(options),
      this.secondary.listPages(options),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    diffListing(
      method,
      { items: primary.pages, total: primary.total, totalPages: primary.totalPages },
      { items: s.value.pages, total: s.value.total, totalPages: s.value.totalPages },
      this._log
    );
    return primary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // listPostStatusCounts
  // ─────────────────────────────────────────────────────────────────────────

  async listPostStatusCounts(now: string): Promise<StatusCounts> {
    const method = "listPostStatusCounts";
    const [p, s] = await Promise.allSettled([
      this.primary.listPostStatusCounts(now),
      this.secondary.listPostStatusCounts(now),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    if (!deepEqual(primary, s.value)) {
      this._log({
        method,
        kind: "divergence",
        detail: `values differ: primary=${JSON.stringify(primary)} secondary=${JSON.stringify(s.value)}`,
      });
    }
    return primary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getPage
  // ─────────────────────────────────────────────────────────────────────────

  async getPage(
    slug: string,
    options?: { includeDrafts?: boolean }
  ): Promise<Page | null> {
    const method = "getPage";
    const [p, s] = await Promise.allSettled([
      this.primary.getPage(slug, options),
      this.secondary.getPage(slug, options),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    if (!deepEqual(primary, s.value)) {
      this._log({ method, kind: "divergence", detail: `slug=${slug}: values differ` });
    }
    return primary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // listTags
  // ─────────────────────────────────────────────────────────────────────────

  async listTags(): Promise<Tag[]> {
    const method = "listTags";
    const [p, s] = await Promise.allSettled([
      this.primary.listTags(),
      this.secondary.listTags(),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    diffTagSet(method, primary, s.value, this._log);
    return primary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // listCategories
  // ─────────────────────────────────────────────────────────────────────────

  async listCategories(): Promise<Category[]> {
    const method = "listCategories";
    const [p, s] = await Promise.allSettled([
      this.primary.listCategories(),
      this.secondary.listCategories(),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    diffTagSet(method, primary, s.value, this._log);
    return primary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getSiteConfig
  // ─────────────────────────────────────────────────────────────────────────

  async getSiteConfig(): Promise<SiteConfig> {
    const method = "getSiteConfig";
    const [p, s] = await Promise.allSettled([
      this.primary.getSiteConfig(),
      this.secondary.getSiteConfig(),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    if (!deepEqual(primary, s.value)) {
      this._log({ method, kind: "divergence", detail: "values differ" });
    }
    return primary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getLinkGraph
  // ─────────────────────────────────────────────────────────────────────────

  async getLinkGraph(): Promise<LinkGraph> {
    const method = "getLinkGraph";
    const [p, s] = await Promise.allSettled([
      this.primary.getLinkGraph(),
      this.secondary.getLinkGraph(),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    // Compare normalised (sorted) graphs so that ordering differences in nodes,
    // edges, and broken links do not produce false-positive divergences. The
    // two adapters may return the same graph in different array orders because
    // they read content from different sources (readdir vs. SQL without ORDER BY).
    if (!deepEqual(normalizeLinkGraph(primary), normalizeLinkGraph(s.value))) {
      this._log({ method, kind: "divergence", detail: "values differ" });
    }
    return primary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getUnlinkedMentions
  // ─────────────────────────────────────────────────────────────────────────

  async getUnlinkedMentions(
    id: string,
    options?: { publicOnly?: boolean }
  ): Promise<UnlinkedMention[]> {
    const method = "getUnlinkedMentions";
    const [p, s] = await Promise.allSettled([
      this.primary.getUnlinkedMentions(id, options),
      this.secondary.getUnlinkedMentions(id, options),
    ]);
    if (p.status === "rejected") throw p.reason;
    const primary = p.value;
    if (s.status === "rejected") {
      this._log({ method, kind: "error", message: errorMessage(s.reason) });
      return primary;
    }
    if (!deepEqual(primary, s.value)) {
      this._log({ method, kind: "divergence", detail: `id=${id}: values differ` });
    }
    return primary;
  }
}
