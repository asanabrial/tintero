import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import matter from "gray-matter";
import { FsContentWriter } from "./fs-writer";

describe("FsContentWriter.setPostStatus", () => {
  let tmpDir: string;
  let writer: FsContentWriter;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `tintero-test-${crypto.randomUUID()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    writer = new FsContentWriter(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("flips published → draft, preserves title/date/tags/body", async () => {
    const md = `---\ntitle: Hello World\ndate: "2026-01-15"\nstatus: published\ntags:\n  - foo\ncategories: []\ncomments: true\n---\n\nBody text here.\n`;
    await fs.writeFile(path.join(tmpDir, "hello-world.md"), md, "utf-8");

    const result = await writer.setPostStatus("hello-world", "draft");
    expect(result.ok).toBe(true);

    const raw = await fs.readFile(path.join(tmpDir, "hello-world.md"), "utf-8");
    const { data, content } = matter(raw);
    expect(data.status).toBe("draft");
    expect(data.title).toBe("Hello World");
    expect(data.tags).toEqual(["foo"]);
    expect(content.trim()).toBe("Body text here.");
  });

  it("flips draft → published", async () => {
    const md = `---\ntitle: My Draft\ndate: "2026-01-15"\nstatus: draft\ntags: []\ncategories: []\ncomments: false\n---\n\nDraft body.\n`;
    await fs.writeFile(path.join(tmpDir, "my-draft.md"), md, "utf-8");

    const result = await writer.setPostStatus("my-draft", "published");
    expect(result.ok).toBe(true);

    const raw = await fs.readFile(path.join(tmpDir, "my-draft.md"), "utf-8");
    const { data } = matter(raw);
    expect(data.status).toBe("published");
  });

  it("date still round-trips as string after flip (YAML 1.1)", async () => {
    const md = `---\ntitle: Date Test\ndate: "2026-06-18"\nstatus: published\ntags: []\ncategories: []\ncomments: true\n---\n\nBody.\n`;
    await fs.writeFile(path.join(tmpDir, "date-test.md"), md, "utf-8");

    await writer.setPostStatus("date-test", "draft");

    const raw = await fs.readFile(path.join(tmpDir, "date-test.md"), "utf-8");
    const { data } = matter(raw);
    expect(typeof data.date).toBe("string");
    expect(data.date).toBe("2026-06-18");
  });

  it("returns post_not_found for unknown slug", async () => {
    const result = await writer.setPostStatus("nonexistent", "draft");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("post_not_found");
    }
  });

  it("preserves unknown extra frontmatter key", async () => {
    const md = `---\ntitle: Extra Keys\ndate: "2026-01-15"\nstatus: published\ntags: []\ncategories: []\ncomments: true\ncustom_field: my-value\n---\n\nBody.\n`;
    await fs.writeFile(path.join(tmpDir, "extra-keys.md"), md, "utf-8");

    await writer.setPostStatus("extra-keys", "draft");

    const raw = await fs.readFile(path.join(tmpDir, "extra-keys.md"), "utf-8");
    const { data } = matter(raw);
    expect(data.custom_field).toBe("my-value");
  });
});
