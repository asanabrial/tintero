import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { FsContentWriter } from "../../../src/lib/content/fs-writer";
import { FsPageWriter } from "../../../src/lib/content/fs-page-writer";
import type { RevisionRepository } from "../../../src/lib/revisions/ports";

// ============================================================
// CRITICAL NON-BLOCK INVARIANT TESTS
// A throwing RevisionRepository MUST NEVER block a content write.
// ============================================================

const THROWING_REPO: RevisionRepository = {
  async record() {
    throw new Error("DB down — simulated failure");
  },
  async listForSlug() {
    return [];
  },
  async getById() {
    return null;
  },
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-test-"));
});

afterEach(async () => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ============================================================
// FsContentWriter non-block tests
// ============================================================

describe("FsContentWriter — revision capture non-block invariant", () => {
  test("updatePost returns { ok: true } even when revision repo throws", async () => {
    const writer = new FsContentWriter(tmpDir, () => THROWING_REPO);

    // Create an initial file so updatePost can find it
    const createResult = await writer.createPost({
      title: "Hello World",
      date: "2024-01-01",
      status: "draft",
      tags: [],
      categories: [],
      comments: false,
      body: "Initial body",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const slug = createResult.slug;

    // Now update — revision repo will throw, but we expect ok: true
    const updateResult = await writer.updatePost(slug, {
      title: "Hello World Updated",
      date: "2024-01-02",
      status: "published",
      tags: ["tag1"],
      categories: [],
      comments: true,
      body: "Updated body content",
    });

    expect(updateResult.ok).toBe(true);
  });

  test("file exists on disk with correct content even when repo throws", async () => {
    const writer = new FsContentWriter(tmpDir, () => THROWING_REPO);

    const createResult = await writer.createPost({
      title: "Test Post",
      date: "2024-06-01",
      status: "draft",
      tags: [],
      categories: [],
      comments: false,
      body: "Original content",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const slug = createResult.slug;

    await writer.updatePost(slug, {
      title: "Test Post Updated",
      date: "2024-06-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      body: "New content after update",
    });

    // File must exist on disk
    const filePath = path.join(tmpDir, `${slug}.md`);
    const fileContent = await fs.readFile(filePath, "utf-8");
    expect(fileContent).toContain("New content after update");
    expect(fileContent).toContain("Test Post Updated");
  });

  test("createPost returns { ok: true } even when revision repo throws", async () => {
    const writer = new FsContentWriter(tmpDir, () => THROWING_REPO);

    const result = await writer.createPost({
      title: "Brand New Post",
      date: "2024-01-01",
      status: "draft",
      tags: [],
      categories: [],
      comments: false,
      body: "New post body",
    });

    expect(result.ok).toBe(true);
  });

  test("no exception propagated to caller when repo throws", async () => {
    const writer = new FsContentWriter(tmpDir, () => THROWING_REPO);

    const createResult = await writer.createPost({
      title: "Safe Post",
      date: "2024-01-01",
      status: "draft",
      tags: [],
      categories: [],
      comments: false,
      body: "Body",
    });
    if (!createResult.ok) return;

    // This should not throw
    let threw = false;
    try {
      await writer.updatePost(createResult.slug, {
        title: "Safe Post",
        date: "2024-01-01",
        status: "draft",
        tags: [],
        categories: [],
        comments: false,
        body: "Updated body",
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });
});

// ============================================================
// FsPageWriter non-block tests
// ============================================================

describe("FsPageWriter — revision capture non-block invariant", () => {
  test("createPage returns { ok: true } even when revision repo throws", async () => {
    const writer = new FsPageWriter(tmpDir, () => THROWING_REPO);

    const result = await writer.createPage({
      title: "About Page",
      date: "2024-01-01",
      body: "About content",
    });

    expect(result.ok).toBe(true);
  });

  test("updatePage returns { ok: true } even when revision repo throws", async () => {
    const writer = new FsPageWriter(tmpDir, () => THROWING_REPO);

    const createResult = await writer.createPage({
      title: "Contact Page",
      date: "2024-01-01",
      body: "Contact content",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const slug = createResult.slug;

    const updateResult = await writer.updatePage(slug, {
      title: "Contact Page Updated",
      date: "2024-01-02",
      body: "Updated contact content",
    });

    expect(updateResult.ok).toBe(true);
  });

  test("page file written to disk even when repo throws", async () => {
    const writer = new FsPageWriter(tmpDir, () => THROWING_REPO);

    const createResult = await writer.createPage({
      title: "Terms Page",
      date: "2024-01-01",
      body: "Terms content",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const slug = createResult.slug;

    await writer.updatePage(slug, {
      title: "Terms Page Updated",
      date: "2024-01-01",
      body: "New terms content",
    });

    const filePath = path.join(tmpDir, `${slug}.md`);
    const fileContent = await fs.readFile(filePath, "utf-8");
    expect(fileContent).toContain("New terms content");
  });
});
