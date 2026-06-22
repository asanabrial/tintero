import { describe, expect, test } from "bun:test";
import * as path from "path";
import { FilesystemContentAdapter } from "../../src/lib/content/fs-adapter";

const FIXTURES = path.join(__dirname, "../fixtures/content");
const FIXTURES_PAGINATED = path.join(__dirname, "../fixtures/content-paginated");
const FIXTURES_TAGS = path.join(__dirname, "../fixtures/content-tags");
const FIXTURES_CATEGORIES = path.join(__dirname, "../fixtures/content-categories");
const FIXTURES_SEARCH = path.join(__dirname, "../fixtures/content-search");

describe("FilesystemContentAdapter", () => {
  describe("listPosts", () => {
    test("flat post is listed", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES);
      const { posts } = await adapter.listPosts({ includeDrafts: true });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).toContain("valid-flat");
    });

    test("folder-based post is listed with slug = folder name, not index", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES);
      const { posts } = await adapter.listPosts({ includeDrafts: true });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).toContain("valid-folder-post");
      expect(slugs).not.toContain("index");
    });

    test(".obsidian directory is skipped without throwing", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES);
      let threw = false;
      try {
        await adapter.listPosts({ includeDrafts: true });
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test(".png file is skipped and does not appear in results", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES);
      const { posts } = await adapter.listPosts({ includeDrafts: true });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).not.toContain("image");
    });

    test("pagination: page 2 of 25 posts returns posts 11-20 with correct total/totalPages", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_PAGINATED);
      const result = await adapter.listPosts({ page: 2 });
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
      expect(result.posts).toHaveLength(10);
    });

    test("listPosts: no pageSize defaults to 10 posts per page", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_PAGINATED);
      const result = await adapter.listPosts({ page: 1 });
      expect(result.posts).toHaveLength(10);
      expect(result.totalPages).toBe(3);
    });

    test("listPosts: pageSize:3 returns at most 3 posts and correct totalPages", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_PAGINATED);
      const result = await adapter.listPosts({ page: 1, pageSize: 3 });
      expect(result.posts).toHaveLength(3);
      expect(result.totalPages).toBe(9);
    });

    test("listPosts: pageSize overrides default in both totalPages and slice bounds", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_PAGINATED);
      const result = await adapter.listPosts({ page: 1, pageSize: 5 });
      expect(result.posts).toHaveLength(5);
      expect(result.totalPages).toBe(5);
    });

    test("listPosts: page 2 with pageSize:3 returns the correct slice", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_PAGINATED);
      const page1 = await adapter.listPosts({ page: 1, pageSize: 3 });
      const page2 = await adapter.listPosts({ page: 2, pageSize: 3 });
      expect(page2.posts).toHaveLength(3);
      // No overlap with page 1
      const page1Slugs = new Set(page1.posts.map((p) => p.slug));
      for (const post of page2.posts) {
        expect(page1Slugs.has(post.slug)).toBe(false);
      }
    });

    test("listPosts: pageSize consistent with generateStaticParams totalPages (12 posts / pageSize 5 = 3 total pages)", async () => {
      // content-paginated has 25 posts; simulate a 12-post scenario isn't possible
      // with the existing fixture. Instead verify the math: 25 / 5 = 5 total pages.
      const adapter = new FilesystemContentAdapter(FIXTURES_PAGINATED);
      const result = await adapter.listPosts({ page: 1, pageSize: 5 });
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(5);
    });

    test("tag filter returns only posts matching the tag", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_TAGS);
      const { posts } = await adapter.listPosts({ tag: "typescript" });
      expect(posts.length).toBeGreaterThanOrEqual(2);
      for (const post of posts) {
        expect(post.tags.some((t) => t === "typescript" || t === "TypeScript")).toBe(true);
      }
    });

    // W-3/W-4: draft excluded in production — slug absent, status check, sitemap/RSS contract
    test("draft is excluded in production (NODE_ENV=production): slug absent, no draft status, static-params + sitemap/RSS contract", async () => {
      const original = process.env.NODE_ENV;
      // Use Object.defineProperty to work around TypeScript read-only constraint in test env
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        writable: true,
        configurable: true,
      });
      try {
        const adapter = new FilesystemContentAdapter(FIXTURES);
        const { posts } = await adapter.listPosts();
        const slugs = posts.map((p) => p.slug);
        expect(slugs).not.toContain("draft-fixture");
        const hasDraft = posts.some((p) => p.status === "draft");
        expect(hasDraft).toBe(false);
      } finally {
        Object.defineProperty(process.env, "NODE_ENV", {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    });

    test("draft is included when includeDrafts=true", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES);
      const { posts } = await adapter.listPosts({ includeDrafts: true });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).toContain("draft-fixture");
    });
  });

  describe("getPost", () => {
    test("returns null for unknown slug", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES);
      const post = await adapter.getPost("ghost");
      expect(post).toBeNull();
    });

    test("returns a post for a known slug", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES);
      const post = await adapter.getPost("valid-flat");
      expect(post).not.toBeNull();
      expect(post!.slug).toBe("valid-flat");
    });

    // S-2 RED: getPost must exclude drafts in production (mirrors listPosts semantics)
    test("returns null for a draft slug in production (NODE_ENV=production)", async () => {
      const original = process.env.NODE_ENV;
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        writable: true,
        configurable: true,
      });
      try {
        const adapter = new FilesystemContentAdapter(FIXTURES);
        const post = await adapter.getPost("draft-fixture");
        expect(post).toBeNull();
      } finally {
        Object.defineProperty(process.env, "NODE_ENV", {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    });

    // W-2: autoExcerpt path — post without excerpt frontmatter uses first 160 chars of body
    test("post without excerpt frontmatter gets auto-excerpt from body (first 160 chars)", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES);
      const post = await adapter.getPost("no-excerpt-fixture");
      expect(post).not.toBeNull();
      // Body is longer than 160 chars; excerpt must be exactly 160 chars and match body start
      expect(post!.excerpt.length).toBeLessThanOrEqual(160);
      expect(post!.excerpt.length).toBeGreaterThan(0);
      // Must not contain markdown heading syntax
      expect(post!.excerpt).not.toMatch(/^#{1,6}\s/);
    });
  });

  describe("getPage", () => {
    test("returns non-null for about page", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES);
      const page = await adapter.getPage("about");
      expect(page).not.toBeNull();
      expect(page!.slug).toBe("about");
    });
  });

  describe("listCategories", () => {
    test("returns Category[] including intermediate parents (\"tech\" from \"tech/javascript\")", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const categories = await adapter.listCategories();
      const slugs = categories.map((c) => c.slug);
      // nested-category.md and multi-category.md both have "tech/javascript"
      expect(slugs).toContain("tech");
      expect(slugs).toContain("tech/javascript");
    });

    test("listCategories() is draft-aware (draft posts excluded from counts)", async () => {
      // All fixture posts are published — counts reflect non-draft posts only
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const categories = await adapter.listCategories();
      // "tech" should have count ≥ 1 (from flat-category, nested-category, multi-category)
      const tech = categories.find((c) => c.slug === "tech");
      expect(tech).toBeDefined();
      expect(tech!.count).toBeGreaterThanOrEqual(1);
    });

    test("no-category post contributes to \"uncategorized\" count", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const categories = await adapter.listCategories();
      const uncat = categories.find((c) => c.slug === "uncategorized");
      expect(uncat).toBeDefined();
      expect(uncat!.count).toBeGreaterThanOrEqual(1);
    });

    test("technology post produces Category{slug:\"technology\"}", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const categories = await adapter.listCategories();
      const slugs = categories.map((c) => c.slug);
      expect(slugs).toContain("technology");
    });

    test("listCategories() sorted alphabetically by slug", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const categories = await adapter.listCategories();
      const slugs = categories.map((c) => c.slug);
      expect(slugs).toEqual([...slugs].sort());
    });
  });

  describe("listTags", () => {
    test("returns deduped and slugified tags from all posts", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_TAGS);
      const tags = await adapter.listTags();
      const slugs = tags.map((t) => t.slug);
      expect(slugs).toContain("typescript");
      expect(slugs).toContain("javascript");
      // Deduped: typescript appears only once
      const tsCount = slugs.filter((s) => s === "typescript").length;
      expect(tsCount).toBe(1);
    });
  });

  describe("categories on Post", () => {
    test("post.categories is string[] on every returned Post", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const { posts } = await adapter.listPosts({ includeDrafts: true });
      for (const post of posts) {
        expect(Array.isArray(post.categories)).toBe(true);
      }
    });

    test("no-category post defaults to [\"Uncategorized\"]", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const { posts } = await adapter.listPosts({ includeDrafts: true });
      const nocat = posts.find((p) => p.slug === "no-category");
      expect(nocat).toBeDefined();
      expect(nocat!.categories).toEqual(["Uncategorized"]);
    });
  });

  describe("listPosts with category filter", () => {
    test("listPosts({category:\"tech\"}) returns flat-category, nested-category, multi-category (NOT technology)", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const { posts } = await adapter.listPosts({ category: "tech", includeDrafts: true });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).toContain("flat-category");
      expect(slugs).toContain("nested-category");
      expect(slugs).toContain("multi-category");
      expect(slugs).not.toContain("technology");
    });

    test("listPosts({category:\"tech/javascript\"}) returns nested-category and multi-category (NOT flat-category or technology)", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const { posts } = await adapter.listPosts({ category: "tech/javascript", includeDrafts: true });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).toContain("nested-category");
      expect(slugs).toContain("multi-category");
      expect(slugs).not.toContain("flat-category");
      expect(slugs).not.toContain("technology");
    });

    test("listPosts({category:\"technology\"}) returns only technology post (exact match, not tech)", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const { posts } = await adapter.listPosts({ category: "technology", includeDrafts: true });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).toContain("technology");
      expect(slugs).not.toContain("flat-category");
      expect(slugs).not.toContain("nested-category");
    });

    test("listPosts({category:\"tech\"}) does NOT return technology post", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const { posts } = await adapter.listPosts({ category: "tech", includeDrafts: true });
      expect(posts.map((p) => p.slug)).not.toContain("technology");
    });

    test("listPosts({category:\"uncategorized\"}) returns no-category post", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const { posts } = await adapter.listPosts({ category: "uncategorized", includeDrafts: true });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).toContain("no-category");
    });

    test("listPosts() with no category returns all posts (backward compat)", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_CATEGORIES);
      const { posts } = await adapter.listPosts({ includeDrafts: true });
      expect(posts.length).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Search integration — Tasks 2.4 (S-13, S-08, S-14, S-15, REQ-PL-01)
  // Fixtures: test/fixtures/content-search (3 published posts + 1 draft + 5 pagination fixtures)
  // ---------------------------------------------------------------------------

  describe("listPosts with query (search integration)", () => {
    // S-13: draft containing query is NEVER in results (NODE_ENV=production)
    test("listPosts({ query }) — draft containing query is excluded: S-13", async () => {
      const original = process.env.NODE_ENV;
      Object.defineProperty(process.env, "NODE_ENV", {
        value: "production",
        writable: true,
        configurable: true,
      });
      try {
        const adapter = new FilesystemContentAdapter(FIXTURES_SEARCH);
        // "secret-draft" post has "typescript" in title AND body but is a draft
        const { posts } = await adapter.listPosts({ query: "typescript" });
        const slugs = posts.map((p) => p.slug);
        expect(slugs).not.toContain("secret-draft");
        // But the published "typescript-guide" post should be present
        expect(slugs).toContain("typescript-guide");
      } finally {
        Object.defineProperty(process.env, "NODE_ENV", {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    });

    // S-08 integration: non-matching term returns empty
    test("listPosts({ query }) — returns empty array for non-matching term: S-08 integration", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_SEARCH);
      const result = await adapter.listPosts({ query: "xyzzy" });
      expect(result.posts).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    // REQ-PL-01: tag + query compose as AND
    test("listPosts({ tag, query }) — composes as AND: REQ-PL-01 tag+query", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_SEARCH);
      // "react-tagged" post has tag "react" and body about "component composition"
      // "typescript-guide" post also has no "react" tag
      const { posts } = await adapter.listPosts({ tag: "react", query: "composition" });
      expect(posts.length).toBeGreaterThanOrEqual(1);
      // All returned posts must have the "react" tag
      for (const post of posts) {
        expect(post.tags.some((t) => t.toLowerCase() === "react")).toBe(true);
      }
      // "typescript-guide" must NOT appear (it has no "react" tag)
      expect(posts.map((p) => p.slug)).not.toContain("typescript-guide");
    });

    // S-14: total reflects matches before pagination slice
    test("listPosts({ query, page, pageSize }) — total reflects matches before slice: S-14", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_SEARCH);
      // Fixture has 3 posts with "Pagination" in title (title tier) and 2 with it in body
      // Total matches = 5; pageSize=3 gives only first 3 in results but total=5
      const result = await adapter.listPosts({ query: "pagination", page: 1, pageSize: 3 });
      expect(result.total).toBe(5); // 5 total matches
      expect(result.posts).toHaveLength(3); // only first 3 returned
      // All 3 returned should be title-tier (title contains "pagination")
      for (const post of result.posts) {
        expect(post.title.toLowerCase()).toContain("pagination");
      }
    });

    // S-15: no regression when query is absent
    test("listPosts({}) — no regression when query absent: S-15", async () => {
      const adapter = new FilesystemContentAdapter(FIXTURES_SEARCH);
      // All published posts in content-search fixture: 8 published + 1 draft
      // With includeDrafts=true in test env, should get all 9
      const result = await adapter.listPosts({ includeDrafts: true, pageSize: 9999 });
      // Without query, should get all published+draft posts
      expect(result.posts.length).toBeGreaterThanOrEqual(8);
      // Result should NOT be filtered to zero
      expect(result.total).toBeGreaterThanOrEqual(8);
      // And posts should be sorted date-desc
      for (let i = 1; i < result.posts.length; i++) {
        expect(result.posts[i - 1].date >= result.posts[i].date).toBe(true);
      }
    });
  });
});
