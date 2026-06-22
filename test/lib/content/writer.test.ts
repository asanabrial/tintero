import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import matter from "gray-matter";

// ============================================================
// WU-1: Pure slug helper tests
// ============================================================
import { slugifyTitle, isSafeSlug, resolveCollisionSlug } from "../../../src/lib/content/slug";

describe("slugifyTitle", () => {
  test("converts basic title to kebab-case", () => {
    expect(slugifyTitle("Hello World!")).toBe("hello-world");
  });

  test("trims whitespace and converts dots to hyphens", () => {
    // Dots are non-alphanumeric and become hyphens
    expect(slugifyTitle("  Next.js  ")).toBe("next-js");
  });

  test("all-numeric title stays as-is", () => {
    expect(slugifyTitle("2024")).toBe("2024");
  });

  test("empty string returns empty string", () => {
    expect(slugifyTitle("")).toBe("");
  });

  test("multiple spaces collapse to single hyphen", () => {
    expect(slugifyTitle("foo   bar")).toBe("foo-bar");
  });

  test("special chars replaced by hyphen, no leading/trailing hyphens", () => {
    expect(slugifyTitle("!hello!")).toBe("hello");
  });
});

describe("isSafeSlug", () => {
  test("valid slug with hyphens returns true", () => {
    expect(isSafeSlug("my-post-2024")).toBe(true);
  });

  test("slug with uppercase letters returns false", () => {
    expect(isSafeSlug("My-Post")).toBe(false);
  });

  test("path traversal slug returns false", () => {
    expect(isSafeSlug("../evil")).toBe(false);
  });

  test("empty string returns false", () => {
    expect(isSafeSlug("")).toBe(false);
  });

  test("double-hyphen returns false", () => {
    expect(isSafeSlug("a--b")).toBe(false);
  });

  test("valid multi-segment slug returns true", () => {
    expect(isSafeSlug("a-b-c")).toBe(true);
  });

  test("single char slug returns true", () => {
    expect(isSafeSlug("a")).toBe(true);
  });

  test("slug with slash returns false", () => {
    expect(isSafeSlug("a/b")).toBe(false);
  });

  test("slug with leading hyphen returns false", () => {
    expect(isSafeSlug("-bad")).toBe(false);
  });

  test("slug with trailing hyphen returns false", () => {
    expect(isSafeSlug("bad-")).toBe(false);
  });
});

describe("resolveCollisionSlug", () => {
  test("no collision returns desired slug unchanged", () => {
    expect(resolveCollisionSlug("foo", new Set<string>())).toBe("foo");
  });

  test("collision with foo and foo-2 resolves to foo-3", () => {
    expect(resolveCollisionSlug("foo", new Set(["foo", "foo-2"]))).toBe("foo-3");
  });

  test("single collision resolves to -2", () => {
    expect(resolveCollisionSlug("bar", new Set(["bar"]))).toBe("bar-2");
  });

  test("many collisions resolve sequentially", () => {
    expect(
      resolveCollisionSlug("x", new Set(["x", "x-2", "x-3", "x-4"]))
    ).toBe("x-5");
  });
});

// ============================================================
// WU-2: serializeFrontmatter / buildFileContent tests
// ============================================================
import { serializeFrontmatter, buildFileContent } from "../../../src/lib/content/fs-writer";

describe("serializeFrontmatter", () => {
  test("produces valid YAML with expected fields", () => {
    const fm = {
      title: "Test Post",
      date: "2024-01-15",
      status: "draft" as const,
      tags: ["nextjs", "typescript"],
      categories: ["tech"],
      comments: true,
    };
    const yaml = serializeFrontmatter(fm);
    const parsed = matter(`---\n${yaml}---\n`).data;
    expect(parsed.title).toBe("Test Post");
    expect(parsed.tags).toEqual(["nextjs", "typescript"]);
    expect(parsed.categories).toEqual(["tech"]);
    expect(parsed.comments).toBe(true);
  });

  test("date round-trips as a YYYY-MM-DD string (not a Date) through gray-matter", () => {
    // Regression: the writer's YAML is read back by gray-matter (js-yaml / YAML 1.1).
    // An unquoted date scalar (e.g. `date: 2026-06-17`) is parsed as a timestamp (Date),
    // which fails the z.string().date() frontmatter schema and silently drops the post
    // from every admin/public listing while it still exists on disk.
    const fm = {
      title: "Dated Post",
      date: "2026-06-17",
      status: "draft" as const,
      tags: [],
      categories: [],
      comments: true,
    };
    const yaml = serializeFrontmatter(fm);
    const parsed = matter(`---\n${yaml}---\n`).data;
    expect(typeof parsed.date).toBe("string");
    expect(parsed.date).toBe("2026-06-17");
  });

  test("comments: false stays boolean false, not string", () => {
    const fm = {
      title: "Post",
      date: "2024-01-15",
      status: "draft" as const,
      tags: [],
      categories: [],
      comments: false,
    };
    const yaml = serializeFrontmatter(fm);
    const parsed = matter(`---\n${yaml}---\n`).data;
    expect(parsed.comments).toBe(false);
    expect(typeof parsed.comments).toBe("boolean");
  });

  test("excerpt: undefined omits the key", () => {
    const fm = {
      title: "Post",
      date: "2024-01-15",
      status: "draft" as const,
      tags: [],
      categories: [],
      comments: true,
    };
    const yaml = serializeFrontmatter(fm);
    expect(yaml).not.toContain("excerpt");
  });

  test("unknown extra keys survive round-trip when merged", () => {
    // This simulates ADR-7: merging validated fields over raw data
    const rawData = {
      title: "Old Title",
      date: "2024-01-15",
      status: "draft",
      tags: [],
      categories: ["Uncategorized"],
      comments: true,
      cover: "hero.jpg", // unknown key
      series: "my-series", // unknown key
    };
    const updatedKnown = {
      title: "New Title",
      date: "2024-01-15",
      status: "draft" as const,
      tags: [],
      categories: ["Uncategorized"],
      comments: true,
    };
    // Merge: known fields over raw copy
    const merged = { ...rawData, ...updatedKnown };
    const yaml = serializeFrontmatter(merged);
    const parsed = matter(`---\n${yaml}---\n`).data;
    expect(parsed.title).toBe("New Title");
    expect(parsed.cover).toBe("hero.jpg");
    expect(parsed.series).toBe("my-series");
  });
});

describe("buildFileContent", () => {
  test("wraps yaml in frontmatter delimiters with blank line before body", () => {
    const fm = {
      title: "Hello",
      date: "2024-01-15",
      status: "draft" as const,
      tags: [],
      categories: [],
      comments: true,
    };
    const content = buildFileContent(fm, "# Heading\n\nParagraph.");
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("\n---\n\n");
    expect(content).toContain("# Heading");
    expect(content).toContain("Paragraph.");
  });

  test("body is trimEnd with trailing newline", () => {
    const fm = {
      title: "Hello",
      date: "2024-01-15",
      status: "draft" as const,
      tags: [],
      categories: [],
      comments: true,
    };
    const content = buildFileContent(fm, "body   \n\n\n");
    expect(content.endsWith("\n")).toBe(true);
    // Should not have multiple trailing newlines (body is trimEnd)
    expect(content.endsWith("body\n")).toBe(true);
  });
});

// ============================================================
// WU-3: FsContentWriter FS seam tests
// ============================================================
import { FsContentWriter } from "../../../src/lib/content/fs-writer";

async function makeTmpPostsDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-writer-test-"));
  return dir;
}

describe("FsContentWriter", () => {
  let postsDir: string;
  let writer: FsContentWriter;

  beforeEach(async () => {
    postsDir = await makeTmpPostsDir();
    writer = new FsContentWriter(postsDir);
  });

  afterEach(async () => {
    await fs.rm(postsDir, { recursive: true, force: true });
  });

  describe("createPost", () => {
    test("happy path: writes file with correct content", async () => {
      const result = await writer.createPost({
        title: "My First Post",
        date: "2024-01-15",
        status: "draft",
        tags: ["nextjs"],
        categories: ["tech"],
        comments: true,
        body: "# Heading\n\nContent here.",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("my-first-post");

      const filePath = path.join(postsDir, "my-first-post.md");
      const raw = await fs.readFile(filePath, "utf-8");
      const { data, content } = matter(raw);
      expect(data.title).toBe("My First Post");
      expect(data.tags).toEqual(["nextjs"]);
      expect(data.categories).toEqual(["tech"]);
      expect(typeof data.comments).toBe("boolean");
      expect(data.comments).toBe(true);
      expect(content.trim()).toContain("# Heading");
    });

    test("SEO overrides round-trip into and out of frontmatter", async () => {
      const result = await writer.createPost({
        title: "SEO Post",
        date: "2024-02-01",
        status: "published",
        tags: [],
        categories: ["tech"],
        comments: true,
        body: "Body content.",
        seo: {
          title: "Custom SEO Title",
          metaDescription: "A custom meta description for search engines.",
          focusKeyphrase: "custom keyphrase",
        },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const raw = await fs.readFile(path.join(postsDir, "seo-post.md"), "utf-8");
      const { data } = matter(raw);
      expect(data.seo).toEqual({
        title: "Custom SEO Title",
        metaDescription: "A custom meta description for search engines.",
        focusKeyphrase: "custom keyphrase",
      });
    });

    test("canonical and noindex round-trip; noindex omitted when false", async () => {
      const withFlags = await writer.createPost({
        title: "Robots Post",
        date: "2024-03-01",
        status: "published",
        tags: [],
        categories: ["tech"],
        comments: true,
        body: "Body.",
        seo: { canonical: "https://example.com/canonical", noindex: true },
      });
      expect(withFlags.ok).toBe(true);
      const rawA = await fs.readFile(path.join(postsDir, "robots-post.md"), "utf-8");
      const seoA = matter(rawA).data.seo as { canonical?: string; noindex?: boolean };
      expect(seoA.canonical).toBe("https://example.com/canonical");
      expect(seoA.noindex).toBe(true);

      const noFlags = await writer.createPost({
        title: "Indexable Post",
        date: "2024-03-02",
        status: "published",
        tags: [],
        categories: ["tech"],
        comments: true,
        body: "Body.",
        seo: { noindex: false },
      });
      expect(noFlags.ok).toBe(true);
      const rawB = await fs.readFile(path.join(postsDir, "indexable-post.md"), "utf-8");
      expect(matter(rawB).data.seo).toBeUndefined();
    });

    test("empty SEO fields omit the seo key entirely", async () => {
      const result = await writer.createPost({
        title: "No SEO Post",
        date: "2024-02-02",
        status: "published",
        tags: [],
        categories: ["tech"],
        comments: true,
        body: "Body.",
        seo: { title: "", metaDescription: "  ", focusKeyphrase: "" },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const raw = await fs.readFile(path.join(postsDir, "no-seo-post.md"), "utf-8");
      const { data } = matter(raw);
      expect(data.seo).toBeUndefined();
    });

    test("updatePost can clear previously-stored SEO overrides", async () => {
      await writer.createPost({
        title: "Clearable SEO",
        date: "2024-02-03",
        status: "published",
        tags: [],
        categories: ["tech"],
        comments: true,
        body: "Body.",
        seo: { focusKeyphrase: "to be removed" },
      });

      const updated = await writer.updatePost("clearable-seo", {
        title: "Clearable SEO",
        date: "2024-02-03",
        status: "published",
        tags: [],
        categories: ["tech"],
        comments: true,
        body: "Body.",
        seo: { title: "", metaDescription: "", focusKeyphrase: "" },
      });
      expect(updated.ok).toBe(true);

      const raw = await fs.readFile(path.join(postsDir, "clearable-seo.md"), "utf-8");
      const { data } = matter(raw);
      expect(data.seo).toBeUndefined();
    });

    test("slug collision on create: auto-resolves to -2", async () => {
      // Pre-create foo.md
      await fs.writeFile(
        path.join(postsDir, "foo.md"),
        "---\ntitle: Foo\ndate: 2024-01-01\nstatus: draft\ntags: []\ncategories: []\ncomments: true\n---\n\nbody\n"
      );

      const result = await writer.createPost({
        title: "Foo",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "New content",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("foo-2");

      // foo-2.md should exist, foo.md should still be intact
      const foo2Exists = await fs.access(path.join(postsDir, "foo-2.md")).then(() => true).catch(() => false);
      expect(foo2Exists).toBe(true);
    });

    test("collision chain: foo, foo-2 both exist → foo-3", async () => {
      for (const name of ["foo", "foo-2"]) {
        await fs.writeFile(
          path.join(postsDir, `${name}.md`),
          `---\ntitle: Foo\ndate: 2024-01-01\nstatus: draft\ntags: []\ncategories: []\ncomments: true\n---\n\nbody\n`
        );
      }
      const result = await writer.createPost({
        title: "Foo",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("foo-3");
    });

    test("explicit slug on create: uses provided slug as filename", async () => {
      const result = await writer.createPost({
        title: "Some Title",
        slug: "my-slug",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("my-slug");
      const exists = await fs.access(path.join(postsDir, "my-slug.md")).then(() => true).catch(() => false);
      expect(exists).toBe(true);
      // slug field in frontmatter is explicit
      const raw = await fs.readFile(path.join(postsDir, "my-slug.md"), "utf-8");
      const { data } = matter(raw);
      expect(data.slug).toBe("my-slug");
    });

    test("auto-derived slug (no explicit override): slug key is absent from frontmatter", async () => {
      // When the final slug equals slugifyTitle(title) — i.e. auto-derived, no user override —
      // the file must NOT include a `slug:` frontmatter key to keep files clean (design ADR).
      const result = await writer.createPost({
        title: "My First Post",
        // no explicit slug field
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("my-first-post");

      const raw = await fs.readFile(path.join(postsDir, "my-first-post.md"), "utf-8");
      const { data } = matter(raw);
      // slug key must be absent — the filename is the source of truth
      expect(Object.prototype.hasOwnProperty.call(data, "slug")).toBe(false);
    });

    test("invalid frontmatter (empty title) returns error, no file written", async () => {
      const result = await writer.createPost({
        title: "",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_frontmatter");

      const files = await fs.readdir(postsDir);
      expect(files.length).toBe(0);
    });

    test("unsafe coverImage (javascript: scheme) is rejected, no file written — write-path validation guard", async () => {
      // Regression: the writer must route coverImage through PostFrontmatterSchema
      // (isSafeMediaUrl refine). Writing input.coverImage directly would let a
      // javascript:/data: URL reach disk and poison the cached <img src>.
      const result = await writer.createPost({
        title: "XSS attempt",
        date: "2024-01-15",
        status: "draft",
        coverImage: "javascript:alert(1)",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_frontmatter");

      const files = await fs.readdir(postsDir);
      expect(files.length).toBe(0);
    });

    test("safe coverImage (/uploads/) is accepted and persisted", async () => {
      const result = await writer.createPost({
        title: "With cover",
        date: "2024-01-15",
        status: "published",
        coverImage: "/uploads/cover.jpg",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raw = await fs.readFile(path.join(postsDir, `${result.slug}.md`), "utf-8");
      const { data } = matter(raw);
      expect(data.coverImage).toBe("/uploads/cover.jpg");
    });

    test("author byline persists to frontmatter when provided", async () => {
      const result = await writer.createPost({
        title: "Bylined",
        date: "2024-01-15",
        status: "published",
        author: "Jane Doe",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raw = await fs.readFile(path.join(postsDir, `${result.slug}.md`), "utf-8");
      const { data } = matter(raw);
      expect(data.author).toBe("Jane Doe");
    });

    test("author key is omitted when not provided", async () => {
      const result = await writer.createPost({
        title: "No byline",
        date: "2024-01-15",
        status: "published",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raw = await fs.readFile(path.join(postsDir, `${result.slug}.md`), "utf-8");
      const { data } = matter(raw);
      expect(Object.prototype.hasOwnProperty.call(data, "author")).toBe(false);
    });

    test("path-traversal slug rejected", async () => {
      const result = await writer.createPost({
        title: "Evil",
        slug: "../evil",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_slug");
    });

    test("charset unsafe slug rejected", async () => {
      const result = await writer.createPost({
        title: "Bad Slug!",
        slug: "Bad Slug!",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_slug");
    });

    test("atomic: no file left on validation failure", async () => {
      await writer.createPost({
        title: "",
        date: "2024-01-15",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "body",
      });
      const files = await fs.readdir(postsDir);
      // No .tmp or .md files left
      expect(files.filter(f => f.endsWith(".md") || f.endsWith(".tmp")).length).toBe(0);
    });
  });

  describe("updatePost", () => {
    test("in-place update: content changes, filename unchanged", async () => {
      // Create a file first
      await fs.writeFile(
        path.join(postsDir, "my-post.md"),
        "---\ntitle: My Post\ndate: 2024-01-01\nstatus: draft\ntags: []\ncategories: [Uncategorized]\ncomments: true\n---\n\nOld body\n"
      );

      const result = await writer.updatePost("my-post", {
        title: "My Updated Post",
        date: "2024-01-01",
        status: "published",
        tags: ["updated"],
        categories: ["tech"],
        comments: true,
        body: "New body",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("my-post");

      // File still at same path
      const raw = await fs.readFile(path.join(postsDir, "my-post.md"), "utf-8");
      const { data, content } = matter(raw);
      expect(data.title).toBe("My Updated Post");
      expect(data.status).toBe("published");
      expect(content.trim()).toBe("New body");
    });

    test("slug change no collision: old gone, new present with slug frontmatter", async () => {
      await fs.writeFile(
        path.join(postsDir, "old-slug.md"),
        "---\ntitle: Old Title\ndate: 2024-01-01\nstatus: draft\ntags: []\ncategories: [Uncategorized]\ncomments: true\n---\n\nbody\n"
      );

      const result = await writer.updatePost("old-slug", {
        title: "Old Title",
        slug: "new-slug",
        date: "2024-01-01",
        status: "draft",
        tags: [],
        categories: ["Uncategorized"],
        comments: true,
        body: "body",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("new-slug");

      const oldExists = await fs.access(path.join(postsDir, "old-slug.md")).then(() => true).catch(() => false);
      expect(oldExists).toBe(false);

      const newExists = await fs.access(path.join(postsDir, "new-slug.md")).then(() => true).catch(() => false);
      expect(newExists).toBe(true);

      const raw = await fs.readFile(path.join(postsDir, "new-slug.md"), "utf-8");
      const { data } = matter(raw);
      expect(data.slug).toBe("new-slug");
    });

    test("slug change with collision: returns slug_collision, no files changed", async () => {
      // Create both files
      for (const name of ["current-post", "existing-post"]) {
        await fs.writeFile(
          path.join(postsDir, `${name}.md`),
          `---\ntitle: ${name}\ndate: 2024-01-01\nstatus: draft\ntags: []\ncategories: [Uncategorized]\ncomments: true\n---\n\nbody\n`
        );
      }

      const result = await writer.updatePost("current-post", {
        title: "current-post",
        slug: "existing-post", // This slug is taken
        date: "2024-01-01",
        status: "draft",
        tags: [],
        categories: ["Uncategorized"],
        comments: true,
        body: "body",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("slug_collision");

      // Both files should still exist unchanged
      const currentExists = await fs.access(path.join(postsDir, "current-post.md")).then(() => true).catch(() => false);
      expect(currentExists).toBe(true);
    });

    test("ADR-7: unknown frontmatter keys preserved on update", async () => {
      await fs.writeFile(
        path.join(postsDir, "my-post.md"),
        "---\ntitle: My Post\ndate: 2024-01-01\nstatus: draft\ntags: []\ncategories: [Uncategorized]\ncomments: true\ncover: hero.jpg\nseries: my-series\n---\n\nbody\n"
      );

      const result = await writer.updatePost("my-post", {
        title: "Updated Post",
        date: "2024-01-01",
        status: "draft",
        tags: [],
        categories: ["Uncategorized"],
        comments: true,
        body: "updated body",
      });

      expect(result.ok).toBe(true);

      const raw = await fs.readFile(path.join(postsDir, "my-post.md"), "utf-8");
      const { data } = matter(raw);
      expect(data.title).toBe("Updated Post");
      expect(data.cover).toBe("hero.jpg");
      expect(data.series).toBe("my-series");
    });

    test("ADR-7: authorId survives updatePost (regression — must not be dropped)", async () => {
      const authorUuid = "550e8400-e29b-41d4-a716-446655440000";
      await fs.writeFile(
        path.join(postsDir, "authored-post.md"),
        `---\ntitle: Authored Post\ndate: 2024-01-01\nstatus: draft\ntags: []\ncategories: [Uncategorized]\ncomments: true\nauthorId: ${authorUuid}\n---\n\nOriginal body\n`
      );

      const result = await writer.updatePost("authored-post", {
        title: "Authored Post Updated",
        date: "2024-01-01",
        status: "draft",
        tags: [],
        categories: ["Uncategorized"],
        comments: true,
        body: "Updated body",
      });

      expect(result.ok).toBe(true);

      const raw = await fs.readFile(path.join(postsDir, "authored-post.md"), "utf-8");
      const { data } = matter(raw);
      expect(data.title).toBe("Authored Post Updated");
      // authorId MUST be preserved by the ADR-7 rawData spread in updatePost
      expect(data.authorId).toBe(authorUuid);
    });

    test("update non-existent post returns post_not_found", async () => {
      const result = await writer.updatePost("does-not-exist", {
        title: "Post",
        date: "2024-01-01",
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
  });

  describe("deletePost", () => {
    test("delete existing post: file removed, returns ok", async () => {
      await fs.writeFile(
        path.join(postsDir, "to-delete.md"),
        "---\ntitle: Delete Me\ndate: 2024-01-01\nstatus: draft\ntags: []\ncategories: []\ncomments: true\n---\n\nbody\n"
      );

      const result = await writer.deletePost("to-delete");
      expect(result.ok).toBe(true);

      const exists = await fs.access(path.join(postsDir, "to-delete.md")).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    test("delete non-existent post: returns ok (graceful)", async () => {
      const result = await writer.deletePost("does-not-exist");
      expect(result.ok).toBe(true);
    });

    test("path-traversal on delete rejected", async () => {
      const result = await writer.deletePost("../evil");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_slug");
    });
  });

  describe("readRaw", () => {
    test("returns frontmatter and body for existing post", async () => {
      await fs.writeFile(
        path.join(postsDir, "my-post.md"),
        "---\ntitle: My Post\ndate: 2024-01-01\nstatus: draft\ntags: [nextjs]\ncategories: [tech]\ncomments: false\n---\n\nPost body.\n"
      );

      const raw = await writer.readRaw("my-post");
      expect(raw).not.toBeNull();
      if (!raw) return;
      expect(raw.frontmatter.title).toBe("My Post");
      expect(raw.frontmatter.tags).toEqual(["nextjs"]);
      expect(raw.frontmatter.comments).toBe(false);
      expect(raw.body.trim()).toBe("Post body.");
    });

    test("returns null for non-existent post", async () => {
      const raw = await writer.readRaw("does-not-exist");
      expect(raw).toBeNull();
    });
  });

  // ============================================================
  // coverImage round-trip tests
  // ============================================================

  describe("coverImage round-trip", () => {
    test("post created WITH coverImage persists the field and date round-trips as string", async () => {
      const result = await writer.createPost({
        title: "Hero Post",
        date: "2026-06-18",
        status: "published",
        tags: [],
        categories: [],
        comments: true,
        body: "content",
        coverImage: "/uploads/hero.jpg",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const filePath = path.join(postsDir, `${result.slug}.md`);
      const raw = await fs.readFile(filePath, "utf-8");
      const { data } = matter(raw);

      // coverImage must persist
      expect(data.coverImage).toBe("/uploads/hero.jpg");
      // date YAML 1.1 regression guard: must be a string, not a Date
      expect(typeof data.date).toBe("string");
      expect(data.date).toBe("2026-06-18");
    });

    test("post created WITHOUT coverImage omits the key from YAML output", async () => {
      const result = await writer.createPost({
        title: "Plain Post",
        date: "2026-06-18",
        status: "published",
        tags: [],
        categories: [],
        comments: true,
        body: "content",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const filePath = path.join(postsDir, `${result.slug}.md`);
      const raw = await fs.readFile(filePath, "utf-8");
      const { data } = matter(raw);

      // coverImage key must be absent
      expect(Object.prototype.hasOwnProperty.call(data, "coverImage")).toBe(false);
    });

    test("update post WITH coverImage persists the field", async () => {
      // First create without coverImage
      const createResult = await writer.createPost({
        title: "Update Target",
        date: "2026-06-18",
        status: "draft",
        tags: [],
        categories: [],
        comments: true,
        body: "original",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // Now update with coverImage
      const updateResult = await writer.updatePost(createResult.slug, {
        title: "Update Target",
        date: "2026-06-18",
        status: "published",
        tags: [],
        categories: [],
        comments: true,
        body: "updated",
        coverImage: "/uploads/cover.png",
      });
      expect(updateResult.ok).toBe(true);
      if (!updateResult.ok) return;

      const filePath = path.join(postsDir, `${updateResult.slug}.md`);
      const raw = await fs.readFile(filePath, "utf-8");
      const { data } = matter(raw);
      expect(data.coverImage).toBe("/uploads/cover.png");
    });
  });
});
