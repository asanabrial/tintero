import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import matter from "gray-matter";

// ============================================================
// WU-2: PageFrontmatterSchema tests (RED first)
// ============================================================
import { PageFrontmatterSchema } from "../../../src/lib/content/schema";

describe("PageFrontmatterSchema", () => {
  test("title required — empty string fails", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "", date: "2026-06-13" });
    expect(result.success).toBe(false);
  });

  test("date required — missing fails", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About" });
    expect(result.success).toBe(false);
  });

  test("date required — non-ISO format fails", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "06/13/2026" });
    expect(result.success).toBe(false);
  });

  test("date valid YYYY-MM-DD passes", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13" });
    expect(result.success).toBe(true);
  });

  test("excerpt optional — absent passes", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13" });
    expect(result.success).toBe(true);
  });

  test("excerpt optional — present passes", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13", excerpt: "A short bio" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.excerpt).toBe("A short bio");
  });

  test("slug optional — absent passes", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13" });
    expect(result.success).toBe(true);
  });

  test("schema does not fail on unknown keys (safeParse raw object)", () => {
    // unknown keys should not cause validation to fail
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13", custom_field: "value" });
    expect(result.success).toBe(true);
  });

  test("no tags/categories/comments fields in schema output (post-only fields excluded)", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Page schema must not add post-only fields (tags, categories, comments)
    // Note: status IS now a valid page field (for draft support)
    expect(Object.prototype.hasOwnProperty.call(result.data, "tags")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.data, "categories")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result.data, "comments")).toBe(false);
  });

  // ---- Feature A: draft status ----
  test("status defaults to 'published' when absent", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("published");
  });

  test("status accepts 'draft'", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13", status: "draft" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("draft");
  });

  test("status accepts 'published' explicitly", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13", status: "published" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("published");
  });

  test("status rejects invalid values like 'pending'", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13", status: "pending" });
    expect(result.success).toBe(false);
  });

  // ---- Feature B: hierarchy ----
  test("menu_order defaults to 0 when absent", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.menu_order).toBe(0);
  });

  test("menu_order accepts positive integer", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13", menu_order: 5 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.menu_order).toBe(5);
  });

  test("parent is optional — absent passes", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.parent).toBeUndefined();
  });

  test("parent present as string passes", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "About", date: "2026-06-13", parent: "services" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.parent).toBe("services");
  });

  test("old page with only title/date/excerpt is valid and status defaults to published", () => {
    const result = PageFrontmatterSchema.safeParse({ title: "Old Page", date: "2020-01-01", excerpt: "Old excerpt" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.status).toBe("published");
    expect(result.data.menu_order).toBe(0);
    expect(result.data.parent).toBeUndefined();
  });
});

// ============================================================
// WU-3: buildPageFileContent + FsPageWriter tests
// These tests are RED until WU-3 is implemented.
// ============================================================
import { buildPageFileContent } from "../../../src/lib/content/fs-page-writer";
import { FsPageWriter } from "../../../src/lib/content/fs-page-writer";

async function makeTmpPagesDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "tintero-page-writer-test-"));
}

// ============================================================
// buildPageFileContent — pure unit tests (no FS)
// ============================================================
describe("buildPageFileContent", () => {
  test("produces frontmatter with title and date only (excerpt absent)", () => {
    const result = buildPageFileContent({ title: "About", date: "2026-06-13" }, "Body text.");
    const { data } = matter(result);
    expect(data.title).toBe("About");
    // gray-matter auto-parses YYYY-MM-DD as a Date object
    expect(data.date instanceof Date || typeof data.date === "string").toBe(true);
    // The file should contain the date string, not undefined
    expect(result).toContain("2026-06-13");
    expect(Object.prototype.hasOwnProperty.call(data, "excerpt")).toBe(false);
  });

  test("includes excerpt when provided", () => {
    const result = buildPageFileContent({ title: "About", date: "2026-06-13", excerpt: "A short bio" }, "Body.");
    const { data } = matter(result);
    expect(data.excerpt).toBe("A short bio");
  });

  test("output does NOT contain tags, categories, or comments (post-only fields)", () => {
    const result = buildPageFileContent({ title: "About", date: "2026-06-13" }, "Body.");
    const { data } = matter(result);
    // status is now a valid page field — but when omitted from fm, it should not appear
    expect(Object.prototype.hasOwnProperty.call(data, "status")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, "tags")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, "categories")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, "comments")).toBe(false);
  });

  test("key order: title before date when slug absent", () => {
    const result = buildPageFileContent({ title: "About", date: "2026-06-13" }, "Body.");
    const keys = Object.keys(matter(result).data);
    expect(keys.indexOf("title")).toBeLessThan(keys.indexOf("date"));
  });

  test("key order: slug before date when slug present", () => {
    const result = buildPageFileContent({ title: "About", slug: "about", date: "2026-06-13" }, "Body.");
    const keys = Object.keys(matter(result).data);
    expect(keys.indexOf("slug")).toBeLessThan(keys.indexOf("date"));
  });

  test("key order: excerpt after date", () => {
    const result = buildPageFileContent({ title: "About", date: "2026-06-13", excerpt: "Bio" }, "Body.");
    const keys = Object.keys(matter(result).data);
    expect(keys.indexOf("date")).toBeLessThan(keys.indexOf("excerpt"));
  });

  test("unknown key custom_field preserved in output", () => {
    const result = buildPageFileContent({ title: "About", date: "2026-06-13", custom_field: "value" }, "Body.");
    const { data } = matter(result);
    expect(data.custom_field).toBe("value");
  });
});

// ============================================================
// FsPageWriter — FS seam tests
// ============================================================
describe("FsPageWriter", () => {
  let pagesDir: string;
  let writer: FsPageWriter;

  beforeEach(async () => {
    pagesDir = await makeTmpPagesDir();
    writer = new FsPageWriter(pagesDir);
  });

  afterEach(async () => {
    await fs.rm(pagesDir, { recursive: true, force: true });
  });

  describe("createPage", () => {
    test("happy path: writes file with correct content", async () => {
      const result = await writer.createPage({
        title: "About Us",
        date: "2026-06-13",
        body: "# About\n\nWe are a team.",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("about-us");

      const filePath = path.join(pagesDir, "about-us.md");
      const raw = await fs.readFile(filePath, "utf-8");
      const { data, content } = matter(raw);
      expect(data.title).toBe("About Us");
      // gray-matter auto-parses YYYY-MM-DD as a Date object; check the raw file instead
      expect(raw).toContain("2026-06-13");
      expect(content.trim()).toContain("# About");
    });

    test("SEO overrides round-trip and clear on update", async () => {
      const created = await writer.createPage({
        title: "SEO Page",
        date: "2026-06-13",
        body: "Body.",
        seo: { title: "Custom Page SEO", metaDescription: "Page meta.", noindex: true },
      });
      expect(created.ok).toBe(true);
      const rawA = await fs.readFile(path.join(pagesDir, "seo-page.md"), "utf-8");
      expect(matter(rawA).data.seo).toEqual({
        title: "Custom Page SEO",
        metaDescription: "Page meta.",
        noindex: true,
      });

      const updated = await writer.updatePage("seo-page", {
        title: "SEO Page",
        date: "2026-06-13",
        body: "Body.",
        seo: { title: "", metaDescription: "", focusKeyphrase: "", canonical: "", noindex: false },
      });
      expect(updated.ok).toBe(true);
      const rawB = await fs.readFile(path.join(pagesDir, "seo-page.md"), "utf-8");
      expect(matter(rawB).data.seo).toBeUndefined();
    });

    test("auto-slug: slug key absent from frontmatter when matches title-derived slug", async () => {
      const result = await writer.createPage({
        title: "About Us",
        date: "2026-06-13",
        body: "Body.",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const raw = await fs.readFile(path.join(pagesDir, "about-us.md"), "utf-8");
      const { data } = matter(raw);
      // No slug key when auto-derived matches title
      expect(Object.prototype.hasOwnProperty.call(data, "slug")).toBe(false);
    });

    test("explicit slug pin: slug key present when user-supplied slug differs from title-derived slug", async () => {
      const result = await writer.createPage({
        title: "About Us",
        slug: "about",
        date: "2026-06-13",
        body: "Body.",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("about");

      const raw = await fs.readFile(path.join(pagesDir, "about.md"), "utf-8");
      const { data } = matter(raw);
      // explicit slug that differs from title-derived is pinned in frontmatter
      expect(data.slug).toBe("about");
    });

    test("collision auto-suffix: existing about.md → about-2.md, original intact", async () => {
      await fs.writeFile(
        path.join(pagesDir, "about.md"),
        "---\ntitle: About\ndate: 2026-01-01\n---\n\nExisting content.\n"
      );

      const result = await writer.createPage({
        title: "About",
        date: "2026-06-13",
        body: "New content.",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("about-2");

      const about2Exists = await fs.access(path.join(pagesDir, "about-2.md")).then(() => true).catch(() => false);
      expect(about2Exists).toBe(true);

      const aboutRaw = await fs.readFile(path.join(pagesDir, "about.md"), "utf-8");
      expect(aboutRaw).toContain("Existing content.");
    });

    test("invalid title (empty string) → invalid_frontmatter, no file written", async () => {
      const result = await writer.createPage({
        title: "",
        date: "2026-06-13",
        body: "Body.",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_frontmatter");

      const files = await fs.readdir(pagesDir);
      expect(files.length).toBe(0);
    });

    test("path traversal slug rejected → invalid_slug, no file outside pagesDir", async () => {
      const result = await writer.createPage({
        title: "Evil",
        slug: "../evil",
        date: "2026-06-13",
        body: "Body.",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_slug");
    });

    test("no post-only keys written: tags/categories/comments absent from file; status absent when published (default)", async () => {
      await writer.createPage({
        title: "About",
        date: "2026-06-13",
        body: "Body.",
      });

      const raw = await fs.readFile(path.join(pagesDir, "about.md"), "utf-8");
      const { data } = matter(raw);
      // status is now a page field, but 'published' (the default) should be omitted
      expect(Object.prototype.hasOwnProperty.call(data, "status")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(data, "tags")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(data, "categories")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(data, "comments")).toBe(false);
    });
  });

  describe("updatePage", () => {
    test("in-place update: content changes, filename unchanged", async () => {
      await fs.writeFile(
        path.join(pagesDir, "about.md"),
        "---\ntitle: About\ndate: 2026-01-01\n---\n\nOld body.\n"
      );

      const result = await writer.updatePage("about", {
        title: "About (Updated)",
        date: "2026-06-13",
        body: "New body.",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("about");

      const raw = await fs.readFile(path.join(pagesDir, "about.md"), "utf-8");
      const { data, content } = matter(raw);
      expect(data.title).toBe("About (Updated)");
      expect(content.trim()).toBe("New body.");
    });

    test("slug rename: old file gone, new file present with slug key pinned", async () => {
      await fs.writeFile(
        path.join(pagesDir, "about.md"),
        "---\ntitle: About\ndate: 2026-01-01\n---\n\nbody\n"
      );

      const result = await writer.updatePage("about", {
        title: "About",
        slug: "about-us",
        date: "2026-01-01",
        body: "body",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slug).toBe("about-us");

      const oldExists = await fs.access(path.join(pagesDir, "about.md")).then(() => true).catch(() => false);
      expect(oldExists).toBe(false);

      const newExists = await fs.access(path.join(pagesDir, "about-us.md")).then(() => true).catch(() => false);
      expect(newExists).toBe(true);

      const raw = await fs.readFile(path.join(pagesDir, "about-us.md"), "utf-8");
      const { data } = matter(raw);
      expect(data.slug).toBe("about-us");
    });

    test("rename collision hard-reject: target slug exists → slug_collision, old file intact", async () => {
      for (const name of ["about", "contact"]) {
        await fs.writeFile(
          path.join(pagesDir, `${name}.md`),
          `---\ntitle: ${name}\ndate: 2026-01-01\n---\n\nbody\n`
        );
      }

      const result = await writer.updatePage("about", {
        title: "About",
        slug: "contact",
        date: "2026-01-01",
        body: "body",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("slug_collision");

      // Old file must still be intact
      const aboutExists = await fs.access(path.join(pagesDir, "about.md")).then(() => true).catch(() => false);
      expect(aboutExists).toBe(true);
    });

    test("unknown key preservation: custom_field survives update", async () => {
      await fs.writeFile(
        path.join(pagesDir, "about.md"),
        "---\ntitle: About\ndate: 2026-01-01\ncustom_field: value\n---\n\nbody\n"
      );

      const result = await writer.updatePage("about", {
        title: "About Updated",
        date: "2026-06-13",
        body: "updated body",
      });

      expect(result.ok).toBe(true);

      const raw = await fs.readFile(path.join(pagesDir, "about.md"), "utf-8");
      const { data } = matter(raw);
      expect(data.title).toBe("About Updated");
      expect(data.custom_field).toBe("value");
    });

    test("page_not_found: updatePage with non-existent slug returns error", async () => {
      const result = await writer.updatePage("missing", {
        title: "Missing",
        date: "2026-06-13",
        body: "body",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("page_not_found");
    });

    test("post-only keys stripped: tags removed, genuine custom key (cover) preserved; status preserved if provided", async () => {
      // Arrange: page file manually edited to include post-only keys AND a genuine custom key
      await fs.writeFile(
        path.join(pagesDir, "about.md"),
        [
          "---",
          "title: About",
          "date: 2026-01-01",
          "status: draft",
          "tags:",
          "  - foo",
          "cover: hero.jpg",
          "---",
          "",
          "Old body.",
          "",
        ].join("\n")
      );

      // Act: normal title/body update (no status passed = defaults to published)
      const result = await writer.updatePage("about", {
        title: "About Updated",
        date: "2026-06-13",
        body: "New body.",
      });

      expect(result.ok).toBe(true);

      // Assert: rewritten file must not contain post-only keys, but must keep custom key
      const raw = await fs.readFile(path.join(pagesDir, "about.md"), "utf-8");
      const { data } = matter(raw);
      // status defaults to published when not passed — published is omitted from file
      expect(Object.prototype.hasOwnProperty.call(data, "status")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(data, "tags")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(data, "categories")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(data, "comments")).toBe(false);
      // Genuine author-added custom key must survive
      expect(data.cover).toBe("hero.jpg");
    });
  });

  describe("deletePage", () => {
    test("happy path: file exists → deleted, returns ok", async () => {
      await fs.writeFile(
        path.join(pagesDir, "about.md"),
        "---\ntitle: About\ndate: 2026-01-01\n---\n\nbody\n"
      );

      const result = await writer.deletePage("about");
      expect(result.ok).toBe(true);

      const exists = await fs.access(path.join(pagesDir, "about.md")).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    test("graceful not-found: file absent → ok (no throw)", async () => {
      const result = await writer.deletePage("missing");
      expect(result.ok).toBe(true);
    });

    test("traversal rejected: ../evil slug → invalid_slug", async () => {
      const result = await writer.deletePage("../evil");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_slug");
    });
  });

  describe("readRawPage", () => {
    test("returns frontmatter and body for existing page", async () => {
      await fs.writeFile(
        path.join(pagesDir, "about.md"),
        "---\ntitle: About\ndate: 2026-01-01\nexcerpt: A short bio\n---\n\nPage body.\n"
      );

      const raw = await writer.readRawPage("about");
      expect(raw).not.toBeNull();
      if (!raw) return;
      expect(raw.frontmatter.title).toBe("About");
      expect(raw.frontmatter.excerpt).toBe("A short bio");
      expect(raw.body.trim()).toBe("Page body.");
    });

    test("returns null for non-existent page", async () => {
      const raw = await writer.readRawPage("missing");
      expect(raw).toBeNull();
    });
  });
});

// ============================================================
// FsPageWriter — status + hierarchy
// ============================================================
describe("FsPageWriter — status + hierarchy", () => {
  let pagesDir: string;
  let writer: FsPageWriter;

  beforeEach(async () => {
    pagesDir = await makeTmpPagesDir();
    writer = new FsPageWriter(pagesDir);
  });

  afterEach(async () => {
    await fs.rm(pagesDir, { recursive: true, force: true });
  });

  test("create draft page: status 'draft' written to file", async () => {
    const result = await writer.createPage({
      title: "Draft Page",
      date: "2026-06-18",
      body: "Draft body.",
      status: "draft",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const raw = await fs.readFile(path.join(pagesDir, `${result.slug}.md`), "utf-8");
    const { data } = matter(raw);
    expect(data.status).toBe("draft");
  });

  test("create published page: status key omitted from file (default)", async () => {
    const result = await writer.createPage({
      title: "Published Page",
      date: "2026-06-18",
      body: "Published body.",
      status: "published",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const raw = await fs.readFile(path.join(pagesDir, `${result.slug}.md`), "utf-8");
    const { data } = matter(raw);
    // When status is 'published' (the default), it should be omitted from the file
    expect(Object.prototype.hasOwnProperty.call(data, "status")).toBe(false);
  });

  test("create page with parent + menu_order: values round-trip correctly AND date stays as string", async () => {
    const result = await writer.createPage({
      title: "Child Page",
      date: "2026-06-18",
      body: "Child body.",
      parent: "services",
      menuOrder: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const raw = await fs.readFile(path.join(pagesDir, `${result.slug}.md`), "utf-8");
    const { data } = matter(raw);
    expect(data.parent).toBe("services");
    expect(data.menu_order).toBe(3);
    // Date must survive as string — YAML 1.1 serialization requirement
    expect(raw).toContain("2026-06-18");
  });

  test("create page with no parent: parent key absent from file", async () => {
    const result = await writer.createPage({
      title: "Top Level Page",
      date: "2026-06-18",
      body: "Body.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const raw = await fs.readFile(path.join(pagesDir, `${result.slug}.md`), "utf-8");
    const { data } = matter(raw);
    expect(Object.prototype.hasOwnProperty.call(data, "parent")).toBe(false);
  });

  test("create page with menu_order 0: menu_order key omitted from file (default)", async () => {
    const result = await writer.createPage({
      title: "Default Order Page",
      date: "2026-06-18",
      body: "Body.",
      menuOrder: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const raw = await fs.readFile(path.join(pagesDir, `${result.slug}.md`), "utf-8");
    const { data } = matter(raw);
    // menu_order 0 is the default — should be omitted from the file
    expect(Object.prototype.hasOwnProperty.call(data, "menu_order")).toBe(false);
  });
});
