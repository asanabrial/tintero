/**
 * Tests for nav-related functionality: isNavHref, NavItemSchema (schema.ts),
 * moveItem, reconstructNav, mergeNavConfig, roundTripNavConfig (site-config-writer.ts),
 * and FsSiteConfigWriter.writeNav (FS seam).
 *
 * TDD: pure-helper tests were written BEFORE implementation.
 * WU-1: isNavHref + NavItemSchema
 * WU-2: moveItem + reconstructNav + mergeNavConfig + roundTripNavConfig
 * WU-3: FsSiteConfigWriter.writeNav (FS seam)
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { parse as parseYaml } from "yaml";

import {
  isNavHref,
  NavItemSchema,
  SiteConfigSchema,
} from "../../../src/lib/content/schema";

import {
  moveItem,
  reconstructNav,
  mergeNavConfig,
  roundTripNavConfig,
  FsSiteConfigWriter,
} from "../../../src/lib/content/site-config-writer";

// ============================================================
// WU-1: isNavHref
// ============================================================

describe("isNavHref", () => {
  test("'/' → true (site-relative root)", () => {
    expect(isNavHref("/")).toBe(true);
  });

  test("'/blog' → true (site-relative path)", () => {
    expect(isNavHref("/blog")).toBe(true);
  });

  test("'https://example.com/docs' → true (absolute https)", () => {
    expect(isNavHref("https://example.com/docs")).toBe(true);
  });

  test("'http://example.com' → true (absolute http)", () => {
    expect(isNavHref("http://example.com")).toBe(true);
  });

  test("'blog' (no leading slash) → false", () => {
    expect(isNavHref("blog")).toBe(false);
  });

  test("'ftp://example.com' → false (not http/https)", () => {
    expect(isNavHref("ftp://example.com")).toBe(false);
  });

  test("'mailto:x@y.com' → false (not http/https)", () => {
    expect(isNavHref("mailto:x@y.com")).toBe(false);
  });

  test("'' (empty string) → false", () => {
    expect(isNavHref("")).toBe(false);
  });
});

// ============================================================
// WU-1: NavItemSchema
// ============================================================

describe("NavItemSchema", () => {
  test("valid label + path-relative href passes", () => {
    const result = NavItemSchema.safeParse({ label: "Home", href: "/" });
    expect(result.success).toBe(true);
  });

  test("valid label + https URL passes", () => {
    const result = NavItemSchema.safeParse({ label: "Docs", href: "https://example.com/docs" });
    expect(result.success).toBe(true);
  });

  test("empty label fails", () => {
    const result = NavItemSchema.safeParse({ label: "", href: "/blog" });
    expect(result.success).toBe(false);
  });

  test("whitespace-only label fails (trimmed to empty)", () => {
    const result = NavItemSchema.safeParse({ label: "   ", href: "/about" });
    expect(result.success).toBe(false);
  });

  test("relative href without leading slash fails", () => {
    const result = NavItemSchema.safeParse({ label: "Blog", href: "blog" });
    expect(result.success).toBe(false);
  });

  test("ftp:// href fails", () => {
    const result = NavItemSchema.safeParse({ label: "FTP", href: "ftp://example.com" });
    expect(result.success).toBe(false);
  });

  test("empty href fails", () => {
    const result = NavItemSchema.safeParse({ label: "Home", href: "" });
    expect(result.success).toBe(false);
  });

  test("existing nav item Home→/ passes", () => {
    const result = NavItemSchema.safeParse({ label: "Home", href: "/" });
    expect(result.success).toBe(true);
  });

  test("existing nav item Blog→/blog passes", () => {
    const result = NavItemSchema.safeParse({ label: "Blog", href: "/blog" });
    expect(result.success).toBe(true);
  });

  test("z.array(NavItemSchema) with [] passes SiteConfigSchema.safeParse", () => {
    const result = SiteConfigSchema.safeParse({
      title: "My Blog",
      nav: [],
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// WU-2: moveItem
// ============================================================

describe("moveItem", () => {
  const A = { label: "A", href: "/a" };
  const B = { label: "B", href: "/b" };
  const C = { label: "C", href: "/c" };

  test("[A,B,C] index=1 dir='up' → [B,A,C] (middle up)", () => {
    const result = moveItem([A, B, C], 1, "up");
    expect(result).toEqual([B, A, C]);
  });

  test("[A,B,C] index=1 dir='down' → [A,C,B] (middle down)", () => {
    const result = moveItem([A, B, C], 1, "down");
    expect(result).toEqual([A, C, B]);
  });

  test("[A,B,C] index=0 dir='up' → [A,B,C] (clamp at first)", () => {
    const result = moveItem([A, B, C], 0, "up");
    expect(result).toEqual([A, B, C]);
  });

  test("[A,B,C] index=2 dir='down' → [A,B,C] (clamp at last)", () => {
    const result = moveItem([A, B, C], 2, "down");
    expect(result).toEqual([A, B, C]);
  });

  test("[A] index=0 dir='up' → [A] (single item, no-op, no throw)", () => {
    const result = moveItem([A], 0, "up");
    expect(result).toEqual([A]);
  });

  test("fields preserved on move — [{X,/x},{Y,/y}] index=1 dir='up' → [{Y,/y},{X,/x}]", () => {
    const X = { label: "X", href: "/x" };
    const Y = { label: "Y", href: "/y" };
    const result = moveItem([X, Y], 1, "up");
    expect(result).toEqual([{ label: "Y", href: "/y" }, { label: "X", href: "/x" }]);
  });

  test("input array is NOT mutated", () => {
    const arr = [A, B, C];
    const original = [...arr];
    moveItem(arr, 1, "up");
    expect(arr).toEqual(original);
  });
});

// ============================================================
// WU-2: reconstructNav
// ============================================================

describe("reconstructNav", () => {
  function makeForm(fields: Record<string, string>): { get(name: string): string | null } {
    return {
      get(name: string) {
        return Object.prototype.hasOwnProperty.call(fields, name) ? fields[name] : null;
      },
    };
  }

  test("nav_count=3 with 3 rows → ordered array [Home, Blog, About]", () => {
    const form = makeForm({
      nav_count: "3",
      "nav[0][label]": "Home",
      "nav[0][href]": "/",
      "nav[1][label]": "Blog",
      "nav[1][href]": "/blog",
      "nav[2][label]": "About",
      "nav[2][href]": "/about",
    });
    const result = reconstructNav(form);
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Blog", href: "/blog" },
      { label: "About", href: "/about" },
    ]);
  });

  test("nav_count=0 → []", () => {
    const form = makeForm({ nav_count: "0" });
    const result = reconstructNav(form);
    expect(result).toEqual([]);
  });

  test("nav_count=1 → single item", () => {
    const form = makeForm({
      nav_count: "1",
      "nav[0][label]": "Home",
      "nav[0][href]": "/",
    });
    const result = reconstructNav(form);
    expect(result).toEqual([{ label: "Home", href: "/" }]);
  });

  test("missing fields (form returns null) → empty strings kept, row not dropped", () => {
    const form = makeForm({
      nav_count: "1",
      // no nav[0][label] or nav[0][href] keys
    });
    const result = reconstructNav(form);
    // Row is KEPT with empty strings — validation happens after
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: "", href: "" });
  });
});

// ============================================================
// WU-2: mergeNavConfig
// ============================================================

describe("mergeNavConfig", () => {
  test("{ ...rawObject, nav: newNav } replaces only nav", () => {
    const raw = { title: "My Blog", author: { name: "Author" }, nav: [] };
    const newNav = [{ label: "Home", href: "/" }];
    const result = mergeNavConfig(raw, newNav);
    expect(result.nav).toEqual(newNav);
  });

  test("other keys (title, social, comments, synthetic customKey) survive", () => {
    const raw = {
      title: "My Blog",
      social: { github: "user" },
      comments: { enabled: true },
      customKey: "preserved",
      nav: [],
    };
    const result = mergeNavConfig(raw, [{ label: "Home", href: "/" }]);
    expect(result.title).toBe("My Blog");
    expect((result.social as Record<string, string>).github).toBe("user");
    expect((result.comments as Record<string, boolean>).enabled).toBe(true);
    expect(result.customKey).toBe("preserved");
  });

  test("nav replaced exactly with provided array", () => {
    const raw = { nav: [{ label: "Old", href: "/old" }] };
    const newNav = [{ label: "New", href: "/new" }, { label: "Another", href: "/another" }];
    const result = mergeNavConfig(raw, newNav);
    expect(result.nav).toEqual(newNav);
    expect((result.nav as unknown[]).length).toBe(2);
  });

  test("empty array replaces nav correctly", () => {
    const raw = { nav: [{ label: "Home", href: "/" }] };
    const result = mergeNavConfig(raw, []);
    expect(result.nav).toEqual([]);
  });
});

// ============================================================
// WU-2: roundTripNavConfig
// ============================================================

describe("roundTripNavConfig", () => {
  const validYaml = `title: My Blog
description: "A blog"
baseUrl: "http://localhost:3000"
language: en
author:
  name: Author
nav:
  - label: Home
    href: /
reading:
  homepage: hero-recent
  posts_per_page: 10
comments:
  enabled: true
  moderation: manual
`;

  const validYamlWithCustomKey = `title: My Blog
description: ""
baseUrl: "http://localhost:3000"
language: en
author:
  name: Author
customKey: preserved
nav:
  - label: Home
    href: /
social:
  github: myuser
reading:
  homepage: hero-recent
  posts_per_page: 10
comments:
  enabled: true
  moderation: manual
`;

  test("valid yaml + nav array → ok:true with yaml string where nav is correct and other keys preserved", () => {
    const newNav = [{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }];
    const result = roundTripNavConfig(validYaml, newNav);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const reparsed = parseYaml(result.yaml) as Record<string, unknown>;
      expect(reparsed.nav).toEqual(newNav);
      expect(reparsed.title).toBe("My Blog");
    }
  });

  test("write-guard rejects: nav item with empty label → ok:false", () => {
    const invalidNav = [{ label: "", href: "/" }];
    const result = roundTripNavConfig(validYaml, invalidNav);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  test("invalid YAML string → ok:false", () => {
    const result = roundTripNavConfig("{ invalid: yaml: :", [{ label: "Home", href: "/" }]);
    expect(result.ok).toBe(false);
  });

  test("unknown key customKey survives round-trip", () => {
    const newNav = [{ label: "Home", href: "/" }];
    const result = roundTripNavConfig(validYamlWithCustomKey, newNav);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const reparsed = parseYaml(result.yaml) as Record<string, unknown>;
      expect(reparsed.customKey).toBe("preserved");
      expect((reparsed.social as Record<string, string>).github).toBe("myuser");
    }
  });
});

// ============================================================
// WU-3: FsSiteConfigWriter.writeNav (FS seam)
// ============================================================

describe("FsSiteConfigWriter.writeNav", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nav-writer-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const baseYaml = `title: My Blog
description: "Test blog"
baseUrl: "http://localhost:3000"
language: en
author:
  name: Author
  email: author@example.com
nav:
  - label: Home
    href: /
  - label: Blog
    href: /blog
social:
  github: myuser
customKey: preserved
reading:
  homepage: hero-recent
  posts_per_page: 10
comments:
  enabled: true
  moderation: manual
`;

  test("writeNav success: other keys survive (title, customKey, social, author preserved)", async () => {
    const configPath = path.join(tmpDir, "site.yaml");
    await fs.writeFile(configPath, baseYaml, "utf-8");

    const writer = new FsSiteConfigWriter(configPath);
    const result = await writer.writeNav([{ label: "Home", href: "/" }]);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(written) as Record<string, unknown>;

    expect(parsed.title).toBe("My Blog");
    expect(parsed.customKey).toBe("preserved");
    expect((parsed.social as Record<string, string>).github).toBe("myuser");
    expect(parsed.nav).toEqual([{ label: "Home", href: "/" }]);
  });

  test("writeNav atomic: .site.yaml.tmp absent after success", async () => {
    const configPath = path.join(tmpDir, "site.yaml");
    await fs.writeFile(configPath, baseYaml, "utf-8");

    const writer = new FsSiteConfigWriter(configPath);
    await writer.writeNav([{ label: "Home", href: "/" }]);

    const tmpPath = path.join(tmpDir, ".site.yaml.tmp");
    let tmpExists = false;
    try {
      await fs.access(tmpPath);
      tmpExists = true;
    } catch {
      tmpExists = false;
    }
    expect(tmpExists).toBe(false);
  });

  test("writeNav invalid nav not written: original file unchanged + no tmp file", async () => {
    const configPath = path.join(tmpDir, "site.yaml");
    await fs.writeFile(configPath, baseYaml, "utf-8");
    const originalContent = await fs.readFile(configPath, "utf-8");

    const writer = new FsSiteConfigWriter(configPath);
    // Empty label fails NavItemSchema → write-guard fails
    const result = await writer.writeNav([{ label: "", href: "/" }]);

    expect(result.ok).toBe(false);

    // Original file must be byte-unchanged
    const afterContent = await fs.readFile(configPath, "utf-8");
    expect(afterContent).toBe(originalContent);

    // No tmp file left behind
    const tmpPath = path.join(tmpDir, ".site.yaml.tmp");
    let tmpExists = false;
    try {
      await fs.access(tmpPath);
      tmpExists = true;
    } catch {
      tmpExists = false;
    }
    expect(tmpExists).toBe(false);
  });

  test("writeNav missing file: starts from empty raw, creates file", async () => {
    const configPath = path.join(tmpDir, "site.yaml");
    // Do NOT pre-create the file

    const writer = new FsSiteConfigWriter(configPath);
    const result = await writer.writeNav([{ label: "Home", href: "/" }]);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(written) as Record<string, unknown>;
    expect(parsed.nav).toEqual([{ label: "Home", href: "/" }]);
  });
});
