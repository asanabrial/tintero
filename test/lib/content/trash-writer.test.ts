import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { FsContentWriter } from "../../../src/lib/content/fs-writer";
import { FsPageWriter } from "../../../src/lib/content/fs-page-writer";
import type { RevisionRepository } from "../../../src/lib/revisions/ports";

// No-op revision repo factory
const noopRevisions = () =>
  ({ record: async () => {} }) as unknown as RevisionRepository;

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "tintero-trash-test-"));
}

// Helper: write a minimal post file
async function writePost(dir: string, slug: string, title = "Test Post"): Promise<void> {
  const content = `---\ntitle: "${title}"\ndate: "2026-06-18"\nstatus: published\ntags: []\ncategories: []\ncomments: true\n---\n\nBody text.\n`;
  await fs.writeFile(path.join(dir, `${slug}.md`), content, "utf-8");
}

// Helper: write a minimal page file
async function writePage(dir: string, slug: string, title = "Test Page"): Promise<void> {
  const content = `---\ntitle: "${title}"\ndate: "2026-06-18"\n---\n\nPage body.\n`;
  await fs.writeFile(path.join(dir, `${slug}.md`), content, "utf-8");
}

describe("FsContentWriter — trash (posts)", () => {
  let postsDir: string;
  let writer: FsContentWriter;

  beforeEach(async () => {
    postsDir = await makeTmpDir();
    writer = new FsContentWriter(postsDir, noopRevisions);
  });

  afterEach(async () => {
    await fs.rm(postsDir, { recursive: true, force: true });
    // Also clean up trash dir (it's a sibling of postsDir)
    const trashDir = path.join(path.dirname(postsDir), ".trash", "posts");
    await fs.rm(trashDir, { recursive: true, force: true }).catch(() => {});
  });

  test("trashPost: moves file from postsDir to trashPostsDir; slug.md exists in trash; not in live dir", async () => {
    await writePost(postsDir, "hello-world");
    const result = await writer.trashPost("hello-world");
    expect(result.ok).toBe(true);
    // Not in live dir
    await expect(fs.access(path.join(postsDir, "hello-world.md"))).rejects.toThrow();
    // In trash dir
    const trashDir = path.join(path.dirname(postsDir), ".trash", "posts");
    expect(await fs.access(path.join(trashDir, "hello-world.md")).then(() => true).catch(() => false)).toBe(true);
  });

  test("listTrashedPosts: returns trashed item with slug, title, date", async () => {
    await writePost(postsDir, "hello-world", "Hello World");
    await writer.trashPost("hello-world");
    const items = await writer.listTrashedPosts();
    expect(items.length).toBe(1);
    expect(items[0].slug).toBe("hello-world");
    expect(items[0].title).toBe("Hello World");
    expect(items[0].date).toBe("2026-06-18");
  });

  test("restorePost: moves back; exists in live dir; not in trash; listTrashedPosts returns empty", async () => {
    await writePost(postsDir, "hello-world");
    await writer.trashPost("hello-world");
    const result = await writer.restorePost("hello-world");
    expect(result.ok).toBe(true);
    // Back in live dir
    expect(await fs.access(path.join(postsDir, "hello-world.md")).then(() => true).catch(() => false)).toBe(true);
    // Not in trash
    const trashDir = path.join(path.dirname(postsDir), ".trash", "posts");
    await expect(fs.access(path.join(trashDir, "hello-world.md"))).rejects.toThrow();
    // listTrashedPosts empty
    const items = await writer.listTrashedPosts();
    expect(items.length).toBe(0);
  });

  test("permanentlyDeletePost: removes from trash; not in trash after", async () => {
    await writePost(postsDir, "hello-world");
    await writer.trashPost("hello-world");
    const result = await writer.permanentlyDeletePost("hello-world");
    expect(result.ok).toBe(true);
    const trashDir = path.join(path.dirname(postsDir), ".trash", "posts");
    await expect(fs.access(path.join(trashDir, "hello-world.md"))).rejects.toThrow();
  });

  test("restorePost: slug collision — returns { ok: false, error: { kind: 'slug_collision' } }", async () => {
    await writePost(postsDir, "hello-world");
    await writer.trashPost("hello-world");
    // Put a live file back with same slug
    await writePost(postsDir, "hello-world");
    const result = await writer.restorePost("hello-world");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("slug_collision");
    }
  });

  test("restorePost: post not in trash — returns { ok: false, error: { kind: 'post_not_found' } }", async () => {
    const result = await writer.restorePost("does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("post_not_found");
    }
  });
});

describe("FsPageWriter — trash (pages)", () => {
  let pagesDir: string;
  let writer: FsPageWriter;

  beforeEach(async () => {
    pagesDir = await makeTmpDir();
    writer = new FsPageWriter(pagesDir, noopRevisions);
  });

  afterEach(async () => {
    await fs.rm(pagesDir, { recursive: true, force: true });
    const trashDir = path.join(path.dirname(pagesDir), ".trash", "pages");
    await fs.rm(trashDir, { recursive: true, force: true }).catch(() => {});
  });

  test("trashPage: moves file from pagesDir to trashPagesDir; slug.md exists in trash; not in live dir", async () => {
    await writePage(pagesDir, "about");
    const result = await writer.trashPage("about");
    expect(result.ok).toBe(true);
    await expect(fs.access(path.join(pagesDir, "about.md"))).rejects.toThrow();
    const trashDir = path.join(path.dirname(pagesDir), ".trash", "pages");
    expect(await fs.access(path.join(trashDir, "about.md")).then(() => true).catch(() => false)).toBe(true);
  });

  test("listTrashedPages: returns trashed item with slug, title, date", async () => {
    await writePage(pagesDir, "about", "About Us");
    await writer.trashPage("about");
    const items = await writer.listTrashedPages();
    expect(items.length).toBe(1);
    expect(items[0].slug).toBe("about");
    expect(items[0].title).toBe("About Us");
    expect(items[0].date).toBe("2026-06-18");
  });

  test("restorePage: moves back; exists in live dir; not in trash; listTrashedPages returns empty", async () => {
    await writePage(pagesDir, "about");
    await writer.trashPage("about");
    const result = await writer.restorePage("about");
    expect(result.ok).toBe(true);
    expect(await fs.access(path.join(pagesDir, "about.md")).then(() => true).catch(() => false)).toBe(true);
    const trashDir = path.join(path.dirname(pagesDir), ".trash", "pages");
    await expect(fs.access(path.join(trashDir, "about.md"))).rejects.toThrow();
    const items = await writer.listTrashedPages();
    expect(items.length).toBe(0);
  });

  test("permanentlyDeletePage: removes from trash; not in trash after", async () => {
    await writePage(pagesDir, "about");
    await writer.trashPage("about");
    const result = await writer.permanentlyDeletePage("about");
    expect(result.ok).toBe(true);
    const trashDir = path.join(path.dirname(pagesDir), ".trash", "pages");
    await expect(fs.access(path.join(trashDir, "about.md"))).rejects.toThrow();
  });

  test("restorePage: slug collision — returns { ok: false, error: { kind: 'slug_collision' } }", async () => {
    await writePage(pagesDir, "about");
    await writer.trashPage("about");
    await writePage(pagesDir, "about");
    const result = await writer.restorePage("about");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("slug_collision");
    }
  });

  test("restorePage: page not in trash — returns { ok: false, error: { kind: 'post_not_found' or 'page_not_found' } }", async () => {
    const result = await writer.restorePage("does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["post_not_found", "page_not_found"]).toContain(result.error.kind);
    }
  });
});
