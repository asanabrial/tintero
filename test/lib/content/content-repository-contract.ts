/**
 * Adapter-agnostic ContentRepository READ contract suite.
 *
 * Call runContentRepositoryContract(label, makeHarness) from any test file to
 * run the full behavioral contract against a specific adapter. The first consumer
 * is FilesystemContentAdapter (fs-content-repository.contract.test.ts). Slice 1D
 * will wire DrizzleContentAdapter through the same suite — passing it is the 1D
 * exit criterion.
 *
 * Characterization baseline: FilesystemContentAdapter is the v1 oracle.
 * Surprising behaviors encoded here are documented with "CONTRACT NOTE" comments.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { ContentRepository } from "@/lib/content/ports";
import type { PostSeo } from "@/lib/content/types";

// ============================================================
// Harness contract
// ============================================================

export interface SeedPost {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  status?: "published" | "draft";
  tags?: string[];
  categories?: string[];
  author?: string;
  excerpt?: string;
  body?: string;
  visibility?: "public" | "private" | "password";
  password?: string;
  comments?: boolean;
  sticky?: boolean;
  coverImage?: string;
  seo?: PostSeo;
}

export interface SeedPage {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  status?: "published" | "draft";
  body?: string;
  excerpt?: string;
  parent?: string;
  menuOrder?: number;
  seo?: PostSeo;
}

export interface SeedTaxonomy {
  label: string;
  description?: string;
}

/**
 * Backend-neutral fixture shape. Each adapter's harness materializes it in its
 * own way: FS writes .md + yaml; DB (Slice 1D) will insert rows.
 */
export interface SeedData {
  posts?: SeedPost[];
  pages?: SeedPage[];
  /** Tags with optional descriptions for the taxonomy registry. */
  taxonomyTags?: SeedTaxonomy[];
  /** Categories with optional descriptions for the taxonomy registry. */
  taxonomyCategories?: SeedTaxonomy[];
  siteTitle?: string;
  siteDescription?: string;
  siteBaseUrl?: string;
  siteAuthor?: string;
}

export interface Harness {
  repo: ContentRepository;
  /** Materialize fixtures into this backend (FS: write files; DB: insert rows). */
  seed(data: SeedData): Promise<void>;
  cleanup(): Promise<void>;
}

// ============================================================
// Standard fixture set
// ============================================================

/**
 * The standard fixture seed used by all contract scenarios.
 *
 * Layout:
 *   - 6 published posts (dates 2026-01-01 – 2026-01-06)
 *   - 1 draft post  (draft-one)
 *   - 1 scheduled / future-dated published post  (scheduled-one, 2099-01-01)
 *   - 2 pages (about = published, contact = draft)
 *   - Taxonomy registry with TypeScript tag description and Tech category description
 *   - Wikilink: alpha body → [[Beta Post]]   (edge in getLinkGraph)
 *   - Prose mention: gamma body mentions "Beta Post" without wikilinking
 *                                          (unlinked mention in getUnlinkedMentions)
 *
 * draft-one uses unique tag "draft-only" and category "draft-only-cat" so
 * tag/category counts are identical whether or not the adapter includes drafts —
 * making those assertions deterministic across environments.
 */
const STANDARD_SEED: SeedData = {
  posts: [
    {
      slug: "alpha",
      title: "Alpha Post",
      date: "2026-01-06",
      status: "published",
      tags: ["typescript"],
      categories: ["tech"],
      author: "Alice",
      body: "Alpha body content. This links to [[Beta Post]].",
      coverImage: "/uploads/alpha-cover.jpg",
      seo: {
        title: "Alpha SEO Title",
        metaDescription: "Alpha meta description",
        focusKeyphrase: "alpha typescript",
        canonical: "https://example.com/alpha",
        noindex: true,
        ogImage: "/uploads/alpha-og.jpg",
        cornerstone: false,
      },
    },
    {
      slug: "beta",
      title: "Beta Post",
      date: "2026-01-05",
      status: "published",
      tags: ["javascript", "typescript"],
      categories: ["tech/javascript"],
      author: "Bob",
      body: "Beta body content.",
    },
    {
      slug: "gamma",
      title: "Gamma Post",
      date: "2026-01-04",
      status: "published",
      tags: ["javascript"],
      categories: ["tech"],
      author: "Alice",
      body: "Gamma body. Beta Post is mentioned here without a link.",
    },
    {
      slug: "delta",
      title: "Delta Post",
      date: "2026-01-03",
      status: "published",
      tags: ["rust"],
      categories: ["systems"],
      author: "Bob",
      body: "Delta body.",
    },
    {
      slug: "epsilon",
      title: "Epsilon Post",
      date: "2026-01-02",
      status: "published",
      tags: ["typescript"],
      categories: ["tech"],
      author: "Alice",
      body: "Epsilon body.",
    },
    {
      slug: "zeta",
      title: "Zeta Post",
      date: "2026-01-01",
      status: "published",
      tags: ["rust"],
      categories: ["systems"],
      author: "Bob",
      body: "Zeta body.",
    },
    {
      // Unique tags/categories so counts are env-independent.
      slug: "draft-one",
      title: "Draft One",
      date: "2026-01-07",
      status: "draft",
      tags: ["draft-only"],
      categories: ["draft-only-cat"],
      author: "Alice",
      body: "Draft body.",
    },
    {
      // Future-dated published post — appears in public listings (see CONTRACT NOTE below).
      slug: "scheduled-one",
      title: "Scheduled One",
      date: "2099-01-01",
      status: "published",
      tags: ["future"],
      categories: ["upcoming"],
      author: "Bob",
      body: "Scheduled body.",
    },
  ],
  pages: [
    {
      slug: "about",
      title: "About Page",
      date: "2026-01-01",
      status: "published",
      body: "About us.",
      menuOrder: 0,
      seo: {
        title: "About SEO Title",
        noindex: false,
      },
    },
    {
      slug: "team",
      title: "Team Page",
      date: "2026-01-01",
      status: "published",
      body: "Meet the team.",
      menuOrder: 1,
      parent: "about",
    },
    {
      slug: "contact",
      title: "Contact Page",
      date: "2026-01-01",
      status: "draft",
      body: "Contact us.",
      menuOrder: 2,
    },
  ],
  taxonomyTags: [
    { label: "TypeScript", description: "Typed superset of JavaScript." },
  ],
  taxonomyCategories: [
    { label: "Tech", description: "Technology articles." },
  ],
  siteTitle: "Contract Test Site",
  siteDescription: "Test description",
  siteBaseUrl: "http://localhost:3000",
  siteAuthor: "Test Author",
};

// ============================================================
// Contract runner
// ============================================================

/**
 * Run the full ContentRepository READ contract against the adapter produced by
 * makeHarness. Registers a Bun/Jest-compatible `describe` block under `label`.
 *
 * Usage:
 *   runContentRepositoryContract("FilesystemContentAdapter", makeFsHarness);
 *   runContentRepositoryContract("DrizzleContentAdapter",    makeDrizzleHarness);
 */
export function runContentRepositoryContract(
  label: string,
  makeHarness: () => Promise<Harness>
): void {
  describe(label, () => {
    let harness: Harness;

    beforeAll(async () => {
      harness = await makeHarness();
      await harness.seed(STANDARD_SEED);
    });

    afterAll(async () => {
      await harness.cleanup();
    });

    // ----------------------------------------------------------
    // listPosts
    // ----------------------------------------------------------

    describe("listPosts", () => {
      test("returns only published posts when includeDrafts: false", async () => {
        const { posts } = await harness.repo.listPosts({ includeDrafts: false });
        for (const p of posts) {
          expect(p.status).toBe("published");
        }
      });

      test("returns posts sorted newest-first (date descending)", async () => {
        const { posts } = await harness.repo.listPosts({ includeDrafts: false });
        for (let i = 1; i < posts.length; i++) {
          expect(posts[i - 1].date >= posts[i].date).toBe(true);
        }
      });

      /**
       * CONTRACT NOTE: FilesystemContentAdapter does NOT filter future-dated posts
       * from listPosts. scheduled-one (2099-01-01) appears in public listings and
       * sorts to the top because ISO string "2099-01-01" > "2026-01-06".
       * Scheduling is a display-layer concept in v1, not a filter.
       */
      test("published future-dated post is included in the listing (no auto-exclusion)", async () => {
        const { posts } = await harness.repo.listPosts({ includeDrafts: false });
        const slugs = posts.map((p) => p.slug);
        expect(slugs).toContain("scheduled-one");
      });

      test("pagination: total and totalPages reflect filtered post count", async () => {
        // 7 published posts (6 past + scheduled-one), pageSize=3 → 3 pages
        const result = await harness.repo.listPosts({
          includeDrafts: false,
          pageSize: 3,
          page: 1,
        });
        expect(result.total).toBe(7);
        expect(result.totalPages).toBe(3);
        expect(result.posts).toHaveLength(3);
      });

      test("pagination: page 2 returns the next slice with no overlap with page 1", async () => {
        const page1 = await harness.repo.listPosts({
          includeDrafts: false,
          pageSize: 3,
          page: 1,
        });
        const page2 = await harness.repo.listPosts({
          includeDrafts: false,
          pageSize: 3,
          page: 2,
        });
        const p1Slugs = new Set(page1.posts.map((p) => p.slug));
        for (const post of page2.posts) {
          expect(p1Slugs.has(post.slug)).toBe(false);
        }
      });

      test("filter by tag: returns only posts with that tag", async () => {
        // typescript: alpha, beta, epsilon (3 published posts)
        const { posts, total } = await harness.repo.listPosts({
          tag: "typescript",
          includeDrafts: false,
        });
        expect(total).toBe(3);
        for (const p of posts) {
          const slugified = p.tags.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
          expect(slugified).toContain("typescript");
        }
      });

      test("filter by category: includes posts in child categories (prefix match)", async () => {
        // "tech" matches: alpha(tech), beta(tech/javascript), gamma(tech), epsilon(tech) = 4
        const { posts, total } = await harness.repo.listPosts({
          category: "tech",
          includeDrafts: false,
        });
        expect(total).toBe(4);
        const slugs = posts.map((p) => p.slug);
        expect(slugs).toContain("alpha");
        expect(slugs).toContain("beta"); // tech/javascript is a child of tech
        expect(slugs).toContain("gamma");
        expect(slugs).toContain("epsilon");
      });

      test("filter by category: exact match only (does not bleed into sibling categories)", async () => {
        // "tech/javascript" should not include "tech"-only posts
        const { posts } = await harness.repo.listPosts({
          category: "tech/javascript",
          includeDrafts: false,
        });
        const slugs = posts.map((p) => p.slug);
        expect(slugs).toContain("beta");
        expect(slugs).not.toContain("alpha"); // alpha is "tech" only, not a child of "tech/javascript"
        expect(slugs).not.toContain("gamma");
      });

      test("filter by author: returns only posts by that author", async () => {
        // Alice: alpha (2026-01-06), gamma (2026-01-04), epsilon (2026-01-02) = 3 published
        const { posts, total } = await harness.repo.listPosts({
          author: "Alice",
          includeDrafts: false,
        });
        expect(total).toBe(3);
        for (const p of posts) {
          expect(p.author).toBe("Alice");
        }
      });

      test("includeDrafts: false excludes draft posts", async () => {
        const { posts } = await harness.repo.listPosts({ includeDrafts: false });
        const slugs = posts.map((p) => p.slug);
        expect(slugs).not.toContain("draft-one");
      });

      test("includeDrafts: true includes draft posts", async () => {
        const { posts } = await harness.repo.listPosts({ includeDrafts: true });
        const slugs = posts.map((p) => p.slug);
        expect(slugs).toContain("draft-one");
      });

      /**
       * coverImage projection via listPosts — parity with FilesystemContentAdapter.
       *
       * The FS oracle uses conditional-spread semantics: the key is absent when falsy.
       * alpha has coverImage set; beta does NOT — key must be absent (not null).
       */
      test("coverImage: post with coverImage returns the value via listPosts", async () => {
        const { posts } = await harness.repo.listPosts({ includeDrafts: false });
        const alpha = posts.find((p) => p.slug === "alpha");
        expect(alpha).toBeDefined();
        expect(alpha!.coverImage).toBe("/uploads/alpha-cover.jpg");
      });

      test("coverImage: post without coverImage has coverImage === undefined via listPosts", async () => {
        const { posts } = await harness.repo.listPosts({ includeDrafts: false });
        const beta = posts.find((p) => p.slug === "beta");
        expect(beta).toBeDefined();
        expect(beta!.coverImage).toBeUndefined();
      });

      test("query filter: matches post by title", async () => {
        const { posts } = await harness.repo.listPosts({
          query: "Alpha",
          includeDrafts: false,
        });
        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].slug).toBe("alpha");
      });

      test("query filter: no match returns empty result with total:0 and totalPages:0", async () => {
        const result = await harness.repo.listPosts({
          query: "xyzzy_no_match_ever_12345",
          includeDrafts: false,
        });
        expect(result.posts).toHaveLength(0);
        expect(result.total).toBe(0);
        expect(result.totalPages).toBe(0);
      });

      /**
       * seo projection via listPosts — parity with FilesystemContentAdapter.
       *
       * The FS oracle uses conditional-spread semantics: seo key absent when no seo data.
       * alpha has full seo (all 7 fields); beta does NOT — seo key must be absent.
       * Booleans (noindex, cornerstone) must be real JS booleans, not strings.
       */
      test("seo: post with seo returns the seo object via listPosts", async () => {
        const { posts } = await harness.repo.listPosts({ includeDrafts: false });
        const alpha = posts.find((p) => p.slug === "alpha");
        expect(alpha).toBeDefined();
        expect(alpha!.seo).toBeDefined();
        expect(alpha!.seo!.title).toBe("Alpha SEO Title");
        expect(alpha!.seo!.metaDescription).toBe("Alpha meta description");
        expect(alpha!.seo!.noindex).toBe(true);   // must be boolean true, not string "true"
        expect(alpha!.seo!.cornerstone).toBe(false); // must be boolean false, not string "false"
      });

      test("seo: post without seo has seo === undefined via listPosts", async () => {
        const { posts } = await harness.repo.listPosts({ includeDrafts: false });
        const beta = posts.find((p) => p.slug === "beta");
        expect(beta).toBeDefined();
        expect(beta!.seo).toBeUndefined();
      });

      /**
       * adminStatus filter — CONTRACT NOTE:
       *
       * `adminStatus` runs AFTER the includeDrafts gate. To exercise all three
       * buckets, pass `includeDrafts: true` so draft-one survives into the
       * adminStatus filter (otherwise it is excluded before it reaches the gate).
       *
       * Boundary (from derivePostDisplayStatus in schedule.ts):
       *   - draft post (any date)          → "Draft"   → matches adminStatus:"draft"
       *   - published + date >  now        → "Scheduled" → matches adminStatus:"scheduled"
       *   - published + date <= now        → "Published"  → matches adminStatus:"published"
       *
       * with now="2026-06-01" the STANDARD_SEED splits as:
       *   published  (date <= 2026-06-01): alpha,beta,gamma,delta,epsilon,zeta = 6
       *   scheduled  (published + date > 2026-06-01): scheduled-one = 1
       *   draft                          : draft-one = 1
       *
       * Valid AdminStatus values: "published" | "draft" | "scheduled" — no "all".
       * Pass undefined (omit adminStatus) to get all posts.
       */
      test("adminStatus: 'published' returns only posts that are published AND past-dated", async () => {
        const { posts, total } = await harness.repo.listPosts({
          adminStatus: "published",
          now: "2026-06-01",
          includeDrafts: true,
        });
        expect(total).toBe(6);
        const slugs = posts.map((p) => p.slug);
        // scheduled-one is published but future-dated → "Scheduled", not "Published"
        expect(slugs).not.toContain("scheduled-one");
        // draft-one has status "draft" → "Draft"
        expect(slugs).not.toContain("draft-one");
        for (const p of posts) {
          expect(p.status).toBe("published");
          expect(p.date <= "2026-06-01").toBe(true);
        }
      });

      test("adminStatus: 'scheduled' returns only published future-dated posts", async () => {
        // scheduled-one: published + "2099-01-01" > "2026-06-01" → "Scheduled"
        const { posts, total } = await harness.repo.listPosts({
          adminStatus: "scheduled",
          now: "2026-06-01",
          includeDrafts: true,
        });
        expect(total).toBe(1);
        expect(posts[0].slug).toBe("scheduled-one");
        expect(posts[0].status).toBe("published");
        expect(posts[0].date > "2026-06-01").toBe(true);
      });

      test("adminStatus: 'draft' with includeDrafts:true returns only draft-status posts", async () => {
        // draft-one is the only post with status:"draft" in the seed
        const { posts, total } = await harness.repo.listPosts({
          adminStatus: "draft",
          now: "2026-06-01",
          includeDrafts: true,
        });
        expect(total).toBe(1);
        expect(posts[0].slug).toBe("draft-one");
        expect(posts[0].status).toBe("draft");
      });
    });

    // ----------------------------------------------------------
    // getPost
    // ----------------------------------------------------------

    describe("getPost", () => {
      test("returns a published post by slug", async () => {
        const post = await harness.repo.getPost("alpha");
        expect(post).not.toBeNull();
        expect(post!.slug).toBe("alpha");
        expect(post!.status).toBe("published");
      });

      /**
       * coverImage projection — parity with FilesystemContentAdapter:
       *
       * The FS oracle uses a conditional spread:
       *   ...(frontmatter.coverImage ? { coverImage: frontmatter.coverImage } : {})
       *
       * This means:
       *   (a) A post WITH a coverImage value must return that value.
       *   (b) A post WITHOUT a coverImage must have the key ABSENT (undefined),
       *       NOT null — matching the conditional-spread semantics exactly.
       *
       * alpha has coverImage set; beta does NOT.
       */
      test("coverImage: post with coverImage returns the value via getPost", async () => {
        const post = await harness.repo.getPost("alpha");
        expect(post).not.toBeNull();
        expect(post!.coverImage).toBe("/uploads/alpha-cover.jpg");
      });

      test("coverImage: post without coverImage has coverImage === undefined via getPost", async () => {
        const post = await harness.repo.getPost("beta");
        expect(post).not.toBeNull();
        expect(post!.coverImage).toBeUndefined();
      });

      /**
       * seo projection via getPost — parity with FilesystemContentAdapter.
       *
       * alpha has all 7 seo fields; beta has none. Booleans must be real booleans.
       */
      test("seo: post with seo returns the full seo object via getPost", async () => {
        const post = await harness.repo.getPost("alpha");
        expect(post).not.toBeNull();
        expect(post!.seo).toBeDefined();
        expect(post!.seo!.title).toBe("Alpha SEO Title");
        expect(post!.seo!.metaDescription).toBe("Alpha meta description");
        expect(post!.seo!.focusKeyphrase).toBe("alpha typescript");
        expect(post!.seo!.canonical).toBe("https://example.com/alpha");
        expect(post!.seo!.noindex).toBe(true);      // boolean, not string
        expect(post!.seo!.ogImage).toBe("/uploads/alpha-og.jpg");
        expect(post!.seo!.cornerstone).toBe(false); // boolean, not string
      });

      test("seo: post without seo has seo === undefined via getPost", async () => {
        const post = await harness.repo.getPost("beta");
        expect(post).not.toBeNull();
        expect(post!.seo).toBeUndefined();
      });

      test("returns null for an unknown slug", async () => {
        const post = await harness.repo.getPost("no-such-slug-xyzzy");
        expect(post).toBeNull();
      });

      test("returns null for a draft when includeDrafts: false", async () => {
        const post = await harness.repo.getPost("draft-one", {
          includeDrafts: false,
        });
        expect(post).toBeNull();
      });

      test("returns the draft post when includeDrafts: true", async () => {
        const post = await harness.repo.getPost("draft-one", {
          includeDrafts: true,
        });
        expect(post).not.toBeNull();
        expect(post!.slug).toBe("draft-one");
        expect(post!.status).toBe("draft");
      });
    });

    // ----------------------------------------------------------
    // listPages
    // ----------------------------------------------------------

    describe("listPages", () => {
      test("returns published pages when includeDrafts: false", async () => {
        const { pages } = await harness.repo.listPages({ includeDrafts: false });
        const slugs = pages.map((p) => p.slug);
        expect(slugs).toContain("about");
        expect(slugs).not.toContain("contact");
      });

      test("includes draft pages when includeDrafts: true", async () => {
        const { pages } = await harness.repo.listPages({ includeDrafts: true });
        const slugs = pages.map((p) => p.slug);
        expect(slugs).toContain("contact");
      });

      test("total and totalPages reflect the filtered page count", async () => {
        const result = await harness.repo.listPages({ includeDrafts: false });
        expect(result.total).toBe(2); // "about" (published) + "team" (published child of about)
        expect(result.totalPages).toBe(1);
      });

      /**
       * seo projection via listPages — parity with FilesystemContentAdapter.
       *
       * "about" has partial seo (title + noindex:false); "contact" has none.
       * noindex must be boolean false, not string "false".
       */
      test("seo: page with seo returns the seo object via listPages", async () => {
        const { pages } = await harness.repo.listPages({ includeDrafts: false });
        const about = pages.find((p) => p.slug === "about");
        expect(about).toBeDefined();
        expect(about!.seo).toBeDefined();
        expect(about!.seo!.title).toBe("About SEO Title");
        expect(about!.seo!.noindex).toBe(false); // boolean, not string "false"
      });

      test("seo: page without seo has seo === undefined via listPages", async () => {
        const { pages } = await harness.repo.listPages({ includeDrafts: true });
        const contact = pages.find((p) => p.slug === "contact");
        expect(contact).toBeDefined();
        expect(contact!.seo).toBeUndefined();
      });

      /**
       * Parent round-trip via listPages.
       *
       * "team" is seeded with parent: "about". The adapter must resolve the
       * stored parent reference back to the slug "about".
       * DB harnesses use a two-pass seed (mirrors backfill): all pages inserted
       * with parent_id=null first, then parent_id updated to the parent's UUID.
       * Without the two-pass fix, DB adapters store the slug string in parent_id
       * which resolves to nothing → parent comes back undefined.
       */
      test("child page has parent === parentSlug via listPages", async () => {
        const { pages } = await harness.repo.listPages({ includeDrafts: false });
        const team = pages.find((p) => p.slug === "team");
        expect(team).toBeDefined();
        expect(team!.parent).toBe("about");
      });

      test("page without a parent has parent === undefined via listPages", async () => {
        const { pages } = await harness.repo.listPages({ includeDrafts: false });
        const about = pages.find((p) => p.slug === "about");
        expect(about).toBeDefined();
        expect(about!.parent).toBeUndefined();
      });
    });

    // ----------------------------------------------------------
    // getPage
    // ----------------------------------------------------------

    describe("getPage", () => {
      test("returns a published page by slug", async () => {
        const page = await harness.repo.getPage("about");
        expect(page).not.toBeNull();
        expect(page!.slug).toBe("about");
      });

      test("returns null for an unknown slug", async () => {
        const page = await harness.repo.getPage("no-such-page-xyzzy");
        expect(page).toBeNull();
      });

      test("returns null for a draft page when includeDrafts: false", async () => {
        const page = await harness.repo.getPage("contact", {
          includeDrafts: false,
        });
        expect(page).toBeNull();
      });

      test("returns the draft page when includeDrafts: true", async () => {
        const page = await harness.repo.getPage("contact", {
          includeDrafts: true,
        });
        expect(page).not.toBeNull();
        expect(page!.slug).toBe("contact");
        expect(page!.status).toBe("draft");
      });

      /**
       * seo projection via getPage — parity with FilesystemContentAdapter.
       *
       * "about" has seo.title + seo.noindex:false; "contact" has no seo.
       * noindex must be real boolean false, not string "false".
       */
      test("seo: page with seo returns the seo object via getPage", async () => {
        const page = await harness.repo.getPage("about");
        expect(page).not.toBeNull();
        expect(page!.seo).toBeDefined();
        expect(page!.seo!.title).toBe("About SEO Title");
        expect(page!.seo!.noindex).toBe(false); // boolean, not string
      });

      test("seo: page without seo has seo === undefined via getPage", async () => {
        const page = await harness.repo.getPage("contact", { includeDrafts: true });
        expect(page).not.toBeNull();
        expect(page!.seo).toBeUndefined();
      });

      /**
       * Parent round-trip via getPage.
       *
       * "team" is a child of "about". getPage("team").parent must return "about"
       * (the slug). getPage("about").parent must be undefined (no parent).
       * See the listPages parent note above for the two-pass harness rationale.
       */
      test("child page has parent === parentSlug via getPage", async () => {
        const page = await harness.repo.getPage("team");
        expect(page).not.toBeNull();
        expect(page!.parent).toBe("about");
      });

      test("page without a parent has parent === undefined via getPage", async () => {
        const page = await harness.repo.getPage("about");
        expect(page).not.toBeNull();
        expect(page!.parent).toBeUndefined();
      });
    });

    // ----------------------------------------------------------
    // listPostStatusCounts
    // ----------------------------------------------------------

    describe("listPostStatusCounts", () => {
      /**
       * Fixture breakdown with now="2026-06-01":
       *   - published (date <= now):   alpha, beta, gamma, delta, epsilon, zeta = 6
       *   - scheduled (published + date > now): scheduled-one (2099-01-01) = 1
       *   - draft: draft-one = 1
       *   - all: 8 (counts always include ALL posts — no draft filtering here)
       */
      test("returns correct all/published/draft/scheduled counts", async () => {
        const counts = await harness.repo.listPostStatusCounts("2026-06-01");
        expect(counts.all).toBe(8);
        expect(counts.published).toBe(6);
        expect(counts.draft).toBe(1);
        expect(counts.scheduled).toBe(1);
      });
    });

    // ----------------------------------------------------------
    // listTags
    // ----------------------------------------------------------

    describe("listTags", () => {
      test("returns a deduped list of tags with post counts", async () => {
        const tags = await harness.repo.listTags();
        // typescript: alpha, beta, epsilon (3 published; draft-one uses "draft-only")
        const ts = tags.find((t) => t.slug === "typescript");
        expect(ts).toBeDefined();
        expect(ts!.count).toBe(3);
      });

      test("attaches description from taxonomy registry to matching tag", async () => {
        const tags = await harness.repo.listTags();
        const ts = tags.find((t) => t.slug === "typescript");
        expect(ts?.description).toBe("Typed superset of JavaScript.");
      });
    });

    // ----------------------------------------------------------
    // listCategories
    // ----------------------------------------------------------

    describe("listCategories", () => {
      test("derives parent category entries from hierarchical category paths", async () => {
        const cats = await harness.repo.listCategories();
        const slugs = cats.map((c) => c.slug);
        // beta has "tech/javascript" → both "tech" and "tech/javascript" must appear
        expect(slugs).toContain("tech");
        expect(slugs).toContain("tech/javascript");
      });

      test("hierarchical category has correct segments and depth", async () => {
        const cats = await harness.repo.listCategories();
        const tjs = cats.find((c) => c.slug === "tech/javascript");
        expect(tjs).toBeDefined();
        expect(tjs!.segments).toEqual(["tech", "javascript"]);
        expect(tjs!.depth).toBe(2);
      });

      test("parent category has depth 1 and counts posts in itself and all children", async () => {
        const cats = await harness.repo.listCategories();
        const tech = cats.find((c) => c.slug === "tech");
        expect(tech).toBeDefined();
        expect(tech!.depth).toBe(1);
        // alpha(tech), beta(tech/javascript→contributes to tech), gamma(tech), epsilon(tech) = 4
        // draft-one uses "draft-only-cat" so it does NOT affect "tech" count
        expect(tech!.count).toBe(4);
      });

      test("attaches description from taxonomy registry to matching category", async () => {
        const cats = await harness.repo.listCategories();
        const tech = cats.find((c) => c.slug === "tech");
        expect(tech?.description).toBe("Technology articles.");
      });
    });

    // ----------------------------------------------------------
    // getSiteConfig
    // ----------------------------------------------------------

    describe("getSiteConfig", () => {
      test("returns the seeded site title", async () => {
        const config = await harness.repo.getSiteConfig();
        expect(config.title).toBe("Contract Test Site");
      });

      test("returns the seeded site author name", async () => {
        const config = await harness.repo.getSiteConfig();
        expect(config.author.name).toBe("Test Author");
      });
    });

    // ----------------------------------------------------------
    // getLinkGraph
    // ----------------------------------------------------------

    describe("getLinkGraph", () => {
      /**
       * alpha body contains [[Beta Post]] → wikilink edge to beta.
       * The graph includes ALL content (drafts + private + scheduled) —
       * callers use publicGraph() to derive the reader-facing subgraph.
       */
      test("contains a wikilink edge from the linking post to the linked post", async () => {
        const graph = await harness.repo.getLinkGraph();
        const edge = graph.edges.find(
          (e) => e.from === "post:alpha" && e.to === "post:beta"
        );
        expect(edge).toBeDefined();
        expect(edge?.kind).toBe("wikilink");
      });

      test("graph contains nodes for all seeded content (including drafts and pages)", async () => {
        const graph = await harness.repo.getLinkGraph();
        const ids = new Set(graph.nodes.map((n) => n.id));
        expect(ids.has("post:alpha")).toBe(true);
        expect(ids.has("post:draft-one")).toBe(true); // drafts included in full graph
        expect(ids.has("page:about")).toBe(true);
      });
    });

    // ----------------------------------------------------------
    // getUnlinkedMentions
    // ----------------------------------------------------------

    describe("getUnlinkedMentions", () => {
      /**
       * gamma body: "Beta Post is mentioned here without a link."
       * → prose mention of beta's title, no wikilink → unlinked mention.
       *
       * alpha body: "This links to [[Beta Post]]."
       * → wikilink — NOT an unlinked mention (link constructs are stripped before scanning).
       */
      test("returns a post whose body mentions the target title in prose", async () => {
        const mentions = await harness.repo.getUnlinkedMentions("post:beta");
        const slugs = mentions.map((m) => m.slug);
        expect(slugs).toContain("gamma");
      });

      test("does not return a post that references the target via a wikilink", async () => {
        const mentions = await harness.repo.getUnlinkedMentions("post:beta");
        const slugs = mentions.map((m) => m.slug);
        expect(slugs).not.toContain("alpha");
      });
    });
  });
}
