import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { FilesystemContentAdapter } from "../../../src/lib/content/fs-adapter";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FIXTURES: Array<{ file: string; content: string }> = [
  {
    file: "about.md",
    content: [
      "---",
      'title: "About Us"',
      'date: "2026-06-10"',
      "---",
      "",
      "We are a team dedicated to open source.",
      "",
    ].join("\n"),
  },
  {
    file: "contact.md",
    content: [
      "---",
      'title: "Contact"',
      'date: "2026-06-09"',
      "---",
      "",
      "Reach us during business hours.",
      "",
    ].join("\n"),
  },
  {
    file: "privacy.md",
    content: [
      "---",
      'title: "Privacy Policy"',
      'date: "2026-06-08"',
      "---",
      "",
      "We respect your privacy.",
      "",
    ].join("\n"),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let rootDir: string;
let adapter: FilesystemContentAdapter;

beforeEach(async () => {
  rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-pages-query-test-"));
  const pagesDir = path.join(rootDir, "pages");
  await fs.mkdir(pagesDir, { recursive: true });
  for (const { file, content } of FIXTURES) {
    await fs.writeFile(path.join(pagesDir, file), content, "utf-8");
  }
  adapter = new FilesystemContentAdapter(rootDir);
});

afterEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("FilesystemContentAdapter.listPages — query filtering", () => {
  it("matches by title: 'about' returns only about page", async () => {
    const result = await adapter.listPages({ query: "about" });
    expect(result.total).toBe(1);
    expect(result.pages[0].slug).toBe("about");
  });

  it("matches by body: 'hours' returns contact page (body hit)", async () => {
    const result = await adapter.listPages({ query: "hours" });
    expect(result.total).toBe(1);
    expect(result.pages[0].slug).toBe("contact");
  });

  it("filters non-matches: 'zzz-nomatch' returns total=0", async () => {
    const result = await adapter.listPages({ query: "zzz-nomatch" });
    expect(result.total).toBe(0);
    expect(result.pages).toEqual([]);
    expect(result.totalPages).toBe(0);
  });

  it("backward-compat: no query returns all 3 pages date-desc", async () => {
    const result = await adapter.listPages({});
    expect(result.total).toBe(3);
    // Date-desc: about (2026-06-10), contact (2026-06-09), privacy (2026-06-08)
    expect(result.pages[0].slug).toBe("about");
    expect(result.pages[1].slug).toBe("contact");
    expect(result.pages[2].slug).toBe("privacy");
  });

  it("empty-string query returns total=0 (applySearch contract)", async () => {
    const result = await adapter.listPages({ query: "" });
    expect(result.total).toBe(0);
    expect(result.pages).toEqual([]);
  });
});
