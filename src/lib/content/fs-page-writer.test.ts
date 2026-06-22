import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import matter from "gray-matter";
import { FsPageWriter } from "./fs-page-writer";

describe("FsPageWriter.setPageStatus", () => {
  let tmpDir: string;
  let writer: FsPageWriter;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `tintero-page-test-${crypto.randomUUID()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    writer = new FsPageWriter(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("flips published → draft, preserves other frontmatter and body", async () => {
    const md = `---\ntitle: About\ndate: "2026-01-15"\n---\n\nAbout page body.\n`;
    await fs.writeFile(path.join(tmpDir, "about.md"), md, "utf-8");

    const result = await writer.setPageStatus("about", "draft");
    expect(result.ok).toBe(true);

    const raw = await fs.readFile(path.join(tmpDir, "about.md"), "utf-8");
    const { data, content } = matter(raw);
    expect(data.status).toBe("draft");
    expect(data.title).toBe("About");
    expect(content.trim()).toBe("About page body.");
  });

  it("flips draft → published (status field omitted in output)", async () => {
    const md = `---\ntitle: Contact\ndate: "2026-01-15"\nstatus: draft\n---\n\nContact body.\n`;
    await fs.writeFile(path.join(tmpDir, "contact.md"), md, "utf-8");

    const result = await writer.setPageStatus("contact", "published");
    expect(result.ok).toBe(true);

    const raw = await fs.readFile(path.join(tmpDir, "contact.md"), "utf-8");
    const { data } = matter(raw);
    // published is the default — status field should be absent
    expect(data.status).toBeUndefined();
  });

  it("date still round-trips as string after flip (YAML 1.1)", async () => {
    const md = `---\ntitle: Date Page\ndate: "2026-06-18"\n---\n\nBody.\n`;
    await fs.writeFile(path.join(tmpDir, "date-page.md"), md, "utf-8");

    await writer.setPageStatus("date-page", "draft");

    const raw = await fs.readFile(path.join(tmpDir, "date-page.md"), "utf-8");
    const { data } = matter(raw);
    expect(typeof data.date).toBe("string");
    expect(data.date).toBe("2026-06-18");
  });

  it("returns page_not_found for unknown slug", async () => {
    const result = await writer.setPageStatus("nonexistent", "draft");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("page_not_found");
    }
  });

  it("preserves unknown extra frontmatter key", async () => {
    const md = `---\ntitle: With Extras\ndate: "2026-01-15"\ncustom_meta: hello\n---\n\nBody.\n`;
    await fs.writeFile(path.join(tmpDir, "with-extras.md"), md, "utf-8");

    await writer.setPageStatus("with-extras", "draft");

    const raw = await fs.readFile(path.join(tmpDir, "with-extras.md"), "utf-8");
    const { data } = matter(raw);
    expect(data.custom_meta).toBe("hello");
  });
});
