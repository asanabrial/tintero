// Shared orchestration core for taxonomy bulk operations.
// Pure-ish: takes injected writer + posts, returns a report.
// No verifySession, no updateTag, no redirect — those belong in the server action layer.

import type { Post } from "./types";
import type { ContentWriter, UpdatePostInput } from "./ports";
import type { RevisionContext } from "../revisions/types";
import {
  renameInArray,
  mergeInArray,
  removeFromArray,
  findAffectedPosts,
} from "./taxonomy-ops";

// ============================================================
// Types
// ============================================================

export interface TaxonomyReport {
  succeeded: string[];
  failed: { slug: string; error: string }[];
  /** Same set as succeeded — convenience alias for cache-invalidation loops. */
  rewritten: string[];
}

export type TaxonomyOp =
  | { kind: "rename"; newValue: string }
  | { kind: "merge"; target: string }
  | { kind: "delete" };

// ============================================================
// Core
// ============================================================

/**
 * Apply a taxonomy operation to all affected posts.
 *
 * Per-post atomicity: each post is read → transformed → written independently.
 * One failure does NOT abort the loop (best-effort, D3).
 *
 * Slug/file STABILITY: UpdatePostInput.slug is intentionally omitted so
 * updatePost never renames the file (ADR-7 / D9).
 *
 * CRITICAL: Post.html is rendered HTML — useless for the frontmatter rewrite.
 * We MUST call writer.readRaw(slug) to get the real body and raw frontmatter.
 *
 * UpdatePostInput reconstruction: we set all required fields from the existing
 * parsed post (title, date, status, tags, categories, comments) plus raw.body,
 * then override only `field` with the newly computed array.
 * Unknown frontmatter keys survive via updatePost's ADR-7 spread in FsContentWriter.
 */
export async function applyTaxonomyOp(
  writer: ContentWriter,
  posts: Post[],
  field: "categories" | "tags",
  value: string,
  op: TaxonomyOp,
  rev?: RevisionContext
): Promise<TaxonomyReport> {
  const succeeded: string[] = [];
  const failed: { slug: string; error: string }[] = [];

  const affected = findAffectedPosts(posts, field, value);

  for (const post of affected) {
    try {
      // Read raw body and frontmatter — Post.html is rendered HTML, not the source body.
      const raw = await writer.readRaw(post.slug);
      if (raw === null) {
        failed.push({ slug: post.slug, error: "post_not_found" });
        continue;
      }

      // Compute the new taxonomy array via the matching pure transform.
      // We use the CURRENT field array from the post (already parsed from frontmatter).
      const currentArray: string[] = post[field];
      let newArray: string[];

      switch (op.kind) {
        case "rename":
          newArray = renameInArray(currentArray, value, op.newValue);
          break;
        case "merge":
          newArray = mergeInArray(currentArray, value, op.target);
          break;
        case "delete":
          newArray = removeFromArray(currentArray, value, field);
          break;
      }

      // Build the full UpdatePostInput.
      // Slug is intentionally omitted (or matched to current) — file MUST NOT be renamed.
      // excerpt is optional: omit when empty to keep files clean.
      const input: UpdatePostInput = {
        title: post.title,
        date: post.date,
        status: post.status,
        excerpt: post.excerpt || undefined,
        tags: field === "tags" ? newArray : post.tags,
        categories: field === "categories" ? newArray : post.categories,
        comments: post.comments,
        body: raw.body,
        // slug intentionally absent — stability requirement D9
      };

      const res = await writer.updatePost(post.slug, input, rev);

      if (res.ok) {
        succeeded.push(post.slug);
      } else {
        failed.push({ slug: post.slug, error: res.error.kind });
      }
    } catch (err) {
      // Catch unexpected errors per post so one failure does not abort others.
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ slug: post.slug, error: message });
    }
  }

  return {
    succeeded,
    failed,
    rewritten: [...succeeded],
  };
}
