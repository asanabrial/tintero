import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";

describe("FilesystemContentAdapter — preview draft access", () => {
  let tmpBase: string;
  let adapter: FilesystemContentAdapter;

  beforeEach(async () => {
    tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-preview-"));
    await fs.mkdir(path.join(tmpBase, "content", "posts"), { recursive: true });
    await fs.mkdir(path.join(tmpBase, "content", "pages"), { recursive: true });
    adapter = new FilesystemContentAdapter(path.join(tmpBase, "content"));
  });

  afterEach(async () => {
    await fs.rm(tmpBase, { recursive: true, force: true });
  });

  // ── getPost with includeDrafts ──────────────────────────────────────
  test("getPost returns null for draft in production-like conditions (no includeDrafts)", async () => {
    await fs.writeFile(
      path.join(tmpBase, "content", "posts", "my-draft.md"),
      `---\ntitle: My Draft\ndate: "2024-01-01"\nstatus: draft\n---\nBody.`
    );
    const result = await adapter.getPost("my-draft", { includeDrafts: false });
    expect(result).toBeNull();
  });

  test("getPost returns draft post when includeDrafts: true", async () => {
    await fs.writeFile(
      path.join(tmpBase, "content", "posts", "my-draft.md"),
      `---\ntitle: My Draft\ndate: "2024-01-01"\nstatus: draft\n---\nBody.`
    );
    const result = await adapter.getPost("my-draft", { includeDrafts: true });
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("my-draft");
    expect(result!.status).toBe("draft");
  });

  test("getPost returns published post regardless of includeDrafts", async () => {
    await fs.writeFile(
      path.join(tmpBase, "content", "posts", "my-post.md"),
      `---\ntitle: My Post\ndate: "2024-01-01"\nstatus: published\n---\nBody.`
    );
    const withDrafts = await adapter.getPost("my-post", { includeDrafts: false });
    expect(withDrafts).not.toBeNull();
  });

  // ── getPage with includeDrafts ──────────────────────────────────────
  test("getPage returns null for draft page without includeDrafts option", async () => {
    await fs.writeFile(
      path.join(tmpBase, "content", "pages", "about.md"),
      `---\ntitle: About\ndate: "2024-01-01"\nstatus: draft\n---\nBody.`
    );
    const result = await adapter.getPage("about", { includeDrafts: false });
    expect(result).toBeNull();
  });

  test("getPage returns draft page when includeDrafts: true", async () => {
    await fs.writeFile(
      path.join(tmpBase, "content", "pages", "about.md"),
      `---\ntitle: About\ndate: "2024-01-01"\nstatus: draft\n---\nBody.`
    );
    const result = await adapter.getPage("about", { includeDrafts: true });
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("about");
    expect(result!.status).toBe("draft");
  });

  test("getPage returns published page regardless of includeDrafts", async () => {
    await fs.writeFile(
      path.join(tmpBase, "content", "pages", "contact.md"),
      `---\ntitle: Contact\ndate: "2024-01-01"\nstatus: published\n---\nBody.`
    );
    const result = await adapter.getPage("contact", { includeDrafts: false });
    expect(result).not.toBeNull();
  });

  // ── previewStatusLabel helper ──────────────────────────────────────
  // (These test the helper we'll add in src/lib/content/preview.ts)
  describe("previewStatusLabel", () => {
    // import tested inline — if the module doesn't exist yet this will fail (RED)
  });
});
