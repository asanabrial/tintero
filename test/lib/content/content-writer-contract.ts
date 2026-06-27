/**
 * Adapter-agnostic ContentWriter CRUD contract suite.
 *
 * Call runContentWriterContract(label, makeHarness) from any test file to
 * run the full behavioral contract against a specific writer adapter.
 *
 * Consumers:
 *   - fs-content-writer.contract.test.ts  (regression — FsContentWriter is the oracle)
 *   - drizzle-content-writer.contract.test.ts  (GREEN gate for DrizzleContentWriter)
 *
 * Adapter-specific behaviors deliberately excluded:
 *   - ADR-7 extra-key preservation (FS-only)
 *   - Trash directory layout (FS-only)
 *   - Authoritative filename-slug derivation (FS-only)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { ContentWriter } from "@/lib/content/ports";
import type { ContentRepository } from "@/lib/content/ports";

// ============================================================
// Harness contract
// ============================================================

export interface WriterHarness {
  writer: ContentWriter;
  reader: ContentRepository;
  cleanup(): Promise<void>;
}

// ============================================================
// Contract runner
// ============================================================

export function runContentWriterContract(
  label: string,
  makeHarness: () => Promise<WriterHarness>
): void {
  describe(`${label} — ContentWriter contract`, () => {
    let h: WriterHarness;

    beforeEach(async () => {
      h = await makeHarness();
    });

    afterEach(async () => {
      await h.cleanup();
    });

    // ------------------------------------------------------------------
    // CREATE + READ BACK
    // ------------------------------------------------------------------

    test("createPost then getPost returns all written fields", async () => {
      const result = await h.writer.createPost({
        title: "Hello World",
        date: "2024-01-15",
        status: "published",
        tags: ["test-tag"],
        categories: ["Tech"],
        comments: true,
        body: "# Hello\n\nContent here.",
        author: "Alice",
        coverImage: "/uploads/cover.jpg",
        sticky: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const post = await h.reader.getPost(result.slug, { includeDrafts: true });
      expect(post).not.toBeNull();
      if (!post) return;

      expect(post.title).toBe("Hello World");
      expect(post.date).toBe("2024-01-15");
      expect(post.status).toBe("published");
      expect(post.tags).toContain("test-tag");
      // categories can include default "Uncategorized" — just assert "Tech" is present
      expect(post.categories.some((c) => c === "Tech")).toBe(true);
      expect(post.author).toBe("Alice");
      expect(post.coverImage).toBe("/uploads/cover.jpg");
      expect(post.comments).toBe(true);
      expect(post.sticky).toBe(true);
      // Rendered HTML must be non-empty for a non-empty body
      expect(post.html.length).toBeGreaterThan(0);
    });

    test("createPost with explicit slug uses that slug", async () => {
      const result = await h.writer.createPost({
        title: "My Post",
        slug: "my-custom-slug",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: false,
        body: "body",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("my-custom-slug");

      const post = await h.reader.getPost("my-custom-slug", { includeDrafts: true });
      expect(post).not.toBeNull();
    });

    test("createPost auto-resolves slug collision with -2 suffix", async () => {
      // Create first post
      const first = await h.writer.createPost({
        title: "Foo Bar",
        date: "2024-01-15",
        status: "published",
        tags: [],
        categories: [],
        comments: true,
        body: "first",
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.slug).toBe("foo-bar");

      // Create second post with same derived slug
      const second = await h.writer.createPost({
        title: "Foo Bar",
        date: "2024-01-16",
        status: "published",
        tags: [],
        categories: [],
        comments: true,
        body: "second",
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.slug).toBe("foo-bar-2");

      // Both posts should be readable
      const p1 = await h.reader.getPost("foo-bar", { includeDrafts: true });
      const p2 = await h.reader.getPost("foo-bar-2", { includeDrafts: true });
      expect(p1).not.toBeNull();
      expect(p2).not.toBeNull();
    });

    // ------------------------------------------------------------------
    // UPDATE
    // ------------------------------------------------------------------

    test("updatePost edits fields in place (same slug)", async () => {
      const created = await h.writer.createPost({
        title: "Original Title",
        date: "2024-01-15",
        status: "draft",
        tags: ["old-tag"],
        categories: ["OldCat"],
        comments: false,
        body: "old body",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const slug = created.slug;

      const updated = await h.writer.updatePost(slug, {
        title: "Updated Title",
        date: "2024-02-01",
        status: "published",
        tags: ["new-tag"],
        categories: ["NewCat"],
        comments: true,
        body: "new body",
      });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.slug).toBe(slug);

      const post = await h.reader.getPost(slug, { includeDrafts: true });
      expect(post).not.toBeNull();
      if (!post) return;
      expect(post.title).toBe("Updated Title");
      expect(post.date).toBe("2024-02-01");
      expect(post.status).toBe("published");
      expect(post.tags).toContain("new-tag");
      expect(post.tags).not.toContain("old-tag");
      expect(post.comments).toBe(true);
    });

    test("updatePost renames slug: old slug gone, new slug present", async () => {
      const created = await h.writer.createPost({
        title: "Old Post",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const updated = await h.writer.updatePost(created.slug, {
        title: "Old Post",
        slug: "brand-new-slug",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.slug).toBe("brand-new-slug");

      const oldPost = await h.reader.getPost(created.slug, { includeDrafts: true });
      expect(oldPost).toBeNull();

      const newPost = await h.reader.getPost("brand-new-slug", { includeDrafts: true });
      expect(newPost).not.toBeNull();
    });

    test("updatePost rename collision → slug_collision error", async () => {
      await h.writer.createPost({
        title: "Post A",
        slug: "post-a",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "a",
      });
      await h.writer.createPost({
        title: "Post B",
        slug: "post-b",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "b",
      });

      const result = await h.writer.updatePost("post-a", {
        title: "Post A",
        slug: "post-b", // taken by post-b
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "a",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("slug_collision");

      // post-a must still be readable (no mutation on collision)
      const postA = await h.reader.getPost("post-a", { includeDrafts: true });
      expect(postA).not.toBeNull();
    });

    test("updatePost non-existent → post_not_found", async () => {
      const result = await h.writer.updatePost("does-not-exist-xyz", {
        title: "Post",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("post_not_found");
    });

    // ------------------------------------------------------------------
    // SET POST STATUS
    // ------------------------------------------------------------------

    test("setPostStatus flips draft → published → draft", async () => {
      const created = await h.writer.createPost({
        title: "Status Post",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const slug = created.slug;

      // Flip to published
      const pub = await h.writer.setPostStatus(slug, "published");
      expect(pub.ok).toBe(true);
      const pubPost = await h.reader.getPost(slug, { includeDrafts: true });
      expect(pubPost?.status).toBe("published");

      // Flip back to draft
      const draftResult = await h.writer.setPostStatus(slug, "draft");
      expect(draftResult.ok).toBe(true);
      const draftPost = await h.reader.getPost(slug, { includeDrafts: true });
      expect(draftPost?.status).toBe("draft");
    });

    // ------------------------------------------------------------------
    // DELETE
    // ------------------------------------------------------------------

    test("deletePost removes post (getPost returns null)", async () => {
      const created = await h.writer.createPost({
        title: "To Delete",
        date: "2024-01-15",
        status: "published",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const slug = created.slug;

      const deleteResult = await h.writer.deletePost(slug);
      expect(deleteResult.ok).toBe(true);

      const post = await h.reader.getPost(slug, { includeDrafts: true });
      expect(post).toBeNull();
    });

    test("deletePost absent → ok:true (graceful)", async () => {
      const result = await h.writer.deletePost("does-not-exist-abc");
      expect(result.ok).toBe(true);
    });

    // ------------------------------------------------------------------
    // READ RAW
    // ------------------------------------------------------------------

    test("readRaw returns null for non-existent post", async () => {
      const raw = await h.writer.readRaw("no-such-post-xyz");
      expect(raw).toBeNull();
    });

    test("readRaw round-trips tags, categories, author, visibility, body", async () => {
      const created = await h.writer.createPost({
        title: "Raw Round Trip",
        date: "2024-03-01",
        status: "draft",
        tags: ["tag-a", "tag-b"],
        categories: ["CatOne"],
        author: "Bob",
        visibility: "private",
        comments: false,
        body: "body text here",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const raw = await h.writer.readRaw(created.slug);
      expect(raw).not.toBeNull();
      if (!raw) return;

      // Body
      expect(raw.body).toContain("body text here");

      // Author — check both frontmatter and rawData paths
      const author = raw.rawData.author ?? raw.frontmatter.author;
      expect(author).toBe("Bob");

      // Visibility
      const visibility = raw.rawData.visibility ?? raw.frontmatter.visibility;
      expect(visibility).toBe("private");

      // Tags — at least one of the written tags must be present
      const tags = (raw.rawData.tags ?? raw.frontmatter.tags) as string[];
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);

      // Categories
      const cats = (raw.rawData.categories ?? raw.frontmatter.categories) as string[];
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.length).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------
    // SEO LIFECYCLE
    // ------------------------------------------------------------------

    test("seo: createPost with seo, getPost reflects seo fields", async () => {
      const created = await h.writer.createPost({
        title: "SEO Post",
        date: "2024-04-01",
        status: "published",
        tags: [],
        categories: [],
        comments: true,
        body: "seo body",
        seo: {
          title: "Custom SEO Title",
          metaDescription: "A meta description",
          cornerstone: true,
        },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const post = await h.reader.getPost(created.slug, { includeDrafts: true });
      expect(post?.seo).toBeDefined();
      expect(post?.seo?.title).toBe("Custom SEO Title");
      expect(post?.seo?.metaDescription).toBe("A meta description");
      expect(post?.seo?.cornerstone).toBe(true);
    });

    test("seo: updatePost changes a seo field, reader reflects new value", async () => {
      const created = await h.writer.createPost({
        title: "SEO Update Post",
        date: "2024-04-02",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
        seo: { title: "Original SEO" },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const updated = await h.writer.updatePost(created.slug, {
        title: "SEO Update Post",
        date: "2024-04-02",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
        seo: { title: "Updated SEO", metaDescription: "New desc" },
      });
      expect(updated.ok).toBe(true);

      const post = await h.reader.getPost(created.slug, { includeDrafts: true });
      expect(post?.seo?.title).toBe("Updated SEO");
      expect(post?.seo?.metaDescription).toBe("New desc");
    });

    test("seo: updatePost removes seo — getPost and readRaw both reflect removal", async () => {
      const created = await h.writer.createPost({
        title: "SEO Remove Post",
        date: "2024-04-03",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
        seo: { title: "Will Be Removed", focusKeyphrase: "to remove" },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // Update with empty seo strings — cleanSeo returns undefined → seo removed
      const updated = await h.writer.updatePost(created.slug, {
        title: "SEO Remove Post",
        date: "2024-04-03",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
        seo: { title: "", focusKeyphrase: "" },
      });
      expect(updated.ok).toBe(true);

      // getPost should have no seo
      const post = await h.reader.getPost(created.slug, { includeDrafts: true });
      expect(post?.seo).toBeUndefined();

      // readRaw should also have no seo
      const raw = await h.writer.readRaw(created.slug);
      const seo = raw?.rawData.seo ?? raw?.frontmatter.seo;
      expect(seo).toBeUndefined();
    });

    test("seo: readRaw round-trips seo fields (title and noindex)", async () => {
      const created = await h.writer.createPost({
        title: "SEO Raw Post",
        date: "2024-05-01",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
        seo: { title: "SEO Title", noindex: true },
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const raw = await h.writer.readRaw(created.slug);
      expect(raw).not.toBeNull();
      if (!raw) return;

      const seo = (raw.rawData.seo ?? raw.frontmatter.seo) as
        | Record<string, unknown>
        | undefined;
      expect(seo).toBeDefined();
      if (!seo) return;
      expect(seo.title).toBe("SEO Title");
      expect(seo.noindex).toBe(true);
    });

    // ------------------------------------------------------------------
    // FIX 4 — S1: slug reuse after delete
    // ------------------------------------------------------------------

    test("slug reuse after delete: createPost → deletePost → createPost same title gets same base slug", async () => {
      const first = await h.writer.createPost({
        title: "Reuse Slug",
        date: "2024-07-01",
        status: "draft",
        tags: [],
        categories: [],
        comments: false,
        body: "first body",
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const originalSlug = first.slug; // e.g. "reuse-slug"

      const del = await h.writer.deletePost(originalSlug);
      expect(del.ok).toBe(true);

      const second = await h.writer.createPost({
        title: "Reuse Slug",
        date: "2024-07-02",
        status: "draft",
        tags: [],
        categories: [],
        comments: false,
        body: "second body",
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      // Slug was freed by delete — no -2 suffix expected
      expect(second.slug).toBe(originalSlug);
    });

    // ------------------------------------------------------------------
    // FIX 4 — S2: same-slug explicit update does not trigger slug_collision
    // ------------------------------------------------------------------

    test("updatePost with slug: currentSlug does not return slug_collision", async () => {
      const created = await h.writer.createPost({
        title: "Same Slug Post",
        slug: "same-slug-post",
        date: "2024-07-01",
        status: "draft",
        tags: [],
        categories: [],
        comments: false,
        body: "original body",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // Update with the SAME slug explicitly provided in the input
      const updated = await h.writer.updatePost(created.slug, {
        title: "Same Slug Post Updated",
        slug: created.slug, // same slug — must not be treated as a collision
        date: "2024-07-01",
        status: "published",
        tags: [],
        categories: [],
        comments: false,
        body: "updated body",
      });
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.slug).toBe("same-slug-post");

      const post = await h.reader.getPost("same-slug-post", { includeDrafts: true });
      expect(post).not.toBeNull();
      expect(post?.title).toBe("Same Slug Post Updated");
    });

    // ------------------------------------------------------------------
    // FIX 4 — W1: readRaw default-visibility shape parity with FS oracle
    // ------------------------------------------------------------------

    test("readRaw default-visibility: visibility key absent from frontmatter when public (FS parity)", async () => {
      const created = await h.writer.createPost({
        title: "Default Visibility Post",
        date: "2024-07-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: false,
        body: "body text",
        // no visibility provided — defaults to "public"
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const raw = await h.writer.readRaw(created.slug);
      expect(raw).not.toBeNull();
      if (!raw) return;

      // Shape parity with FS oracle: when visibility is "public" the key MUST be
      // absent from frontmatter (FS omits it; DB must too after FIX 1).
      expect("visibility" in raw.frontmatter).toBe(false);
      // Callers may always normalize by treating absence as public:
      expect((raw.frontmatter.visibility ?? "public") as string).toBe("public");
    });

    // ------------------------------------------------------------------
    // FIX 2 — C1: authorId is preserved through updatePost (RBAC guard)
    // ------------------------------------------------------------------

    test("updatePost without authorId in input preserves existing authorId", async () => {
      const authorId = "550e8400-e29b-41d4-a716-446655440000";
      const created = await h.writer.createPost({
        title: "Author ID Preservation",
        date: "2024-07-20",
        status: "draft",
        tags: [],
        categories: [],
        comments: false,
        body: "original body",
        authorId,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // Update without providing authorId in the input
      const updated = await h.writer.updatePost(created.slug, {
        title: "Author ID Preservation",
        date: "2024-07-20",
        status: "published",
        tags: [],
        categories: [],
        comments: false,
        body: "updated body",
        // authorId intentionally absent
      });
      expect(updated.ok).toBe(true);

      const raw = await h.writer.readRaw(created.slug);
      expect(raw).not.toBeNull();
      if (!raw) return;

      // authorId MUST survive the update — gates canEditPost RBAC checks
      const actual = (raw.frontmatter.authorId ?? raw.rawData.authorId) as string | undefined;
      expect(actual).toBe(authorId);
    });
  });
}
