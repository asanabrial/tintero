import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { FilesystemContentAdapter } from "../../../src/lib/content/fs-adapter";

// ============================================================
// FilesystemContentAdapter — listPages with draft + hierarchy
// ============================================================

async function makeTmpRootDir(): Promise<{ rootDir: string; pagesDir: string }> {
  // The adapter expects: rootDir/pages/*.md and rootDir/../config/site.yaml
  // We create: tmpRoot/content/pages/*.md
  // Then new FilesystemContentAdapter(path.join(tmpRoot, "content"))
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-fs-adapter-pages-test-"));
  const rootDir = path.join(tmpBase, "content");
  const pagesDir = path.join(rootDir, "pages");
  const configDir = path.join(tmpBase, "config");
  await fs.mkdir(pagesDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });
  return { rootDir, pagesDir };
}

async function writePage(pagesDir: string, slug: string, content: string): Promise<void> {
  await fs.writeFile(path.join(pagesDir, `${slug}.md`), content, "utf-8");
}

describe("FilesystemContentAdapter — listPages draft + hierarchy", () => {
  let rootDir: string;
  let pagesDir: string;
  let adapter: FilesystemContentAdapter;

  beforeEach(async () => {
    ({ rootDir, pagesDir } = await makeTmpRootDir());
    adapter = new FilesystemContentAdapter(rootDir);
  });

  afterEach(async () => {
    // Remove entire temp base (parent of rootDir)
    await fs.rm(path.dirname(rootDir), { recursive: true, force: true });
  });

  test("draft pages excluded when includeDrafts: false explicitly", async () => {
    await writePage(pagesDir, "published-page", [
      "---",
      'title: "Published Page"',
      'date: "2026-01-01"',
      "---",
      "",
      "Published body.",
      "",
    ].join("\n"));

    await writePage(pagesDir, "draft-page", [
      "---",
      'title: "Draft Page"',
      'date: "2026-01-02"',
      "status: draft",
      "---",
      "",
      "Draft body.",
      "",
    ].join("\n"));

    const result = await adapter.listPages({ includeDrafts: false, pageSize: 9999 });
    const slugs = result.pages.map((p) => p.slug);
    expect(slugs).toContain("published-page");
    expect(slugs).not.toContain("draft-page");
  });

  test("draft pages included when includeDrafts: true", async () => {
    await writePage(pagesDir, "published-page", [
      "---",
      'title: "Published Page"',
      'date: "2026-01-01"',
      "---",
      "",
      "Published body.",
      "",
    ].join("\n"));

    await writePage(pagesDir, "draft-page", [
      "---",
      'title: "Draft Page"',
      'date: "2026-01-02"',
      "status: draft",
      "---",
      "",
      "Draft body.",
      "",
    ].join("\n"));

    const result = await adapter.listPages({ includeDrafts: true, pageSize: 9999 });
    const slugs = result.pages.map((p) => p.slug);
    expect(slugs).toContain("published-page");
    expect(slugs).toContain("draft-page");
  });

  test("pages sorted by menuOrder ascending, then title ascending", async () => {
    await writePage(pagesDir, "zeta", [
      "---",
      'title: "Zeta"',
      'date: "2026-01-01"',
      "menu_order: 2",
      "---",
      "",
      "Zeta body.",
      "",
    ].join("\n"));

    await writePage(pagesDir, "alpha", [
      "---",
      'title: "Alpha"',
      'date: "2026-01-02"',
      "menu_order: 1",
      "---",
      "",
      "Alpha body.",
      "",
    ].join("\n"));

    await writePage(pagesDir, "beta", [
      "---",
      'title: "Beta"',
      'date: "2026-01-03"',
      "menu_order: 1",
      "---",
      "",
      "Beta body.",
      "",
    ].join("\n"));

    await writePage(pagesDir, "first", [
      "---",
      'title: "First"',
      'date: "2026-01-04"',
      "menu_order: 0",
      "---",
      "",
      "First body.",
      "",
    ].join("\n"));

    const result = await adapter.listPages({ includeDrafts: false, pageSize: 9999 });
    const titles = result.pages.map((p) => p.title);

    // Order: menu_order 0 first, then 1 (Alpha, Beta alphabetically), then 2 (Zeta)
    expect(titles).toEqual(["First", "Alpha", "Beta", "Zeta"]);
  });
});
