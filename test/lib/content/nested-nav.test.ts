/**
 * Tests for nested nav (one level of submenus).
 * Suites: A = schema, B = FormData parser, C = round-trip / FS seam.
 *
 * TDD: written BEFORE the implementation — run first to confirm RED.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { parse as parseYaml } from "yaml";

import {
  NavLeafSchema,
  NavItemSchema,
  SiteConfigSchema,
} from "../../../src/lib/content/schema";

import {
  reconstructNav,
  roundTripNavConfig,
  FsSiteConfigWriter,
} from "../../../src/lib/content/site-config-writer";

// ============================================================
// Suite A — Schema tests
// ============================================================

describe("NavLeafSchema", () => {
  test("{ label, href } passes", () => {
    const result = NavLeafSchema.safeParse({ label: "Home", href: "/" });
    expect(result.success).toBe(true);
  });

  test("{ label, href, children: [] } — children is stripped (Zod drops unknown keys)", () => {
    const result = NavLeafSchema.safeParse({
      label: "Home",
      href: "/",
      children: [],
    });
    // Should still succeed — Zod strips unknown keys by default
    expect(result.success).toBe(true);
    if (result.success) {
      // children is stripped from the output — grandchildren not supported
      expect((result.data as Record<string, unknown>).children).toBeUndefined();
    }
  });

  test("flat NavItem with no children is valid as a leaf", () => {
    const result = NavLeafSchema.safeParse({ label: "Blog", href: "/blog" });
    expect(result.success).toBe(true);
  });

  test("empty label fails", () => {
    const result = NavLeafSchema.safeParse({ label: "", href: "/" });
    expect(result.success).toBe(false);
  });

  test("invalid href fails", () => {
    const result = NavLeafSchema.safeParse({ label: "X", href: "bad" });
    expect(result.success).toBe(false);
  });
});

describe("NavItemSchema (with children support)", () => {
  test("{ label, href, children: [{ label, href }] } passes", () => {
    const result = NavItemSchema.safeParse({
      label: "Parent",
      href: "/p",
      children: [{ label: "Child", href: "/c" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.children).toHaveLength(1);
      expect(result.data.children![0].label).toBe("Child");
    }
  });

  test("child with nested children has grandchildren stripped", () => {
    const result = NavItemSchema.safeParse({
      label: "Parent",
      href: "/p",
      children: [
        {
          label: "Child",
          href: "/c",
          children: [{ label: "Grandchild", href: "/g" }],
        },
      ],
    });
    // Should still succeed — Zod strips unknown keys in children (NavLeafSchema)
    expect(result.success).toBe(true);
    if (result.success) {
      const child = result.data.children![0] as Record<string, unknown>;
      expect(child.children).toBeUndefined();
    }
  });

  test("flat item { label, href } with no children is valid", () => {
    const result = NavItemSchema.safeParse({ label: "Home", href: "/" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.children).toBeUndefined();
    }
  });

  test("empty children array is valid", () => {
    const result = NavItemSchema.safeParse({
      label: "Menu",
      href: "/menu",
      children: [],
    });
    expect(result.success).toBe(true);
  });

  test("child with invalid href fails", () => {
    const result = NavItemSchema.safeParse({
      label: "Parent",
      href: "/p",
      children: [{ label: "Child", href: "bad-href" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("SiteConfigSchema — backward compat with flat nav", () => {
  test("flat nav item { label, href } passes SiteConfigSchema", () => {
    const result = SiteConfigSchema.safeParse({
      title: "Blog",
      nav: [{ label: "Home", href: "/" }],
    });
    expect(result.success).toBe(true);
  });

  test("nested nav item passes SiteConfigSchema", () => {
    const result = SiteConfigSchema.safeParse({
      title: "Blog",
      nav: [
        {
          label: "Parent",
          href: "/p",
          children: [{ label: "Child", href: "/c" }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Suite B — FormData parser tests
// ============================================================

function makeForm(
  fields: Record<string, string>
): { get(name: string): string | null } {
  return {
    get(name: string) {
      return Object.prototype.hasOwnProperty.call(fields, name)
        ? fields[name]
        : null;
    },
  };
}

describe("reconstructNav — nested children", () => {
  test("nav_count=1 with children_count=1 → parent with one child", () => {
    const form = makeForm({
      nav_count: "1",
      "nav[0][label]": "Parent",
      "nav[0][href]": "/p",
      "nav[0][children_count]": "1",
      "nav[0][children][0][label]": "Child",
      "nav[0][children][0][href]": "/c",
    });
    const result = reconstructNav(form);
    expect(result).toEqual([
      {
        label: "Parent",
        href: "/p",
        children: [{ label: "Child", href: "/c" }],
      },
    ]);
  });

  test("nav_count=1 with no children fields → flat item (no children key)", () => {
    const form = makeForm({
      nav_count: "1",
      "nav[0][label]": "Flat",
      "nav[0][href]": "/f",
    });
    const result = reconstructNav(form);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Flat");
    expect(result[0].href).toBe("/f");
    // No children key at all
    expect(Object.prototype.hasOwnProperty.call(result[0], "children")).toBe(
      false
    );
  });

  test("empty child row (both label and href blank) → dropped; no children key if all were blank", () => {
    const form = makeForm({
      nav_count: "1",
      "nav[0][label]": "Parent",
      "nav[0][href]": "/p",
      "nav[0][children_count]": "1",
      "nav[0][children][0][label]": "",
      "nav[0][children][0][href]": "",
    });
    const result = reconstructNav(form);
    expect(result[0].label).toBe("Parent");
    // All children were blank → no children key
    expect(Object.prototype.hasOwnProperty.call(result[0], "children")).toBe(
      false
    );
  });

  test("child with blank label but non-blank href → kept", () => {
    const form = makeForm({
      nav_count: "1",
      "nav[0][label]": "Parent",
      "nav[0][href]": "/p",
      "nav[0][children_count]": "1",
      "nav[0][children][0][label]": "",
      "nav[0][children][0][href]": "/c",
    });
    const result = reconstructNav(form);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].href).toBe("/c");
    expect(result[0].children![0].label).toBe("");
  });

  test("nav_count=2 with one parent having 2 children → correct nested structure", () => {
    const form = makeForm({
      nav_count: "2",
      "nav[0][label]": "Home",
      "nav[0][href]": "/",
      "nav[1][label]": "Services",
      "nav[1][href]": "/services",
      "nav[1][children_count]": "2",
      "nav[1][children][0][label]": "Design",
      "nav[1][children][0][href]": "/services/design",
      "nav[1][children][1][label]": "Dev",
      "nav[1][children][1][href]": "/services/dev",
    });
    const result = reconstructNav(form);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ label: "Home", href: "/" });
    expect(Object.prototype.hasOwnProperty.call(result[0], "children")).toBe(
      false
    );
    expect(result[1].children).toHaveLength(2);
    expect(result[1].children![0]).toEqual({
      label: "Design",
      href: "/services/design",
    });
    expect(result[1].children![1]).toEqual({
      label: "Dev",
      href: "/services/dev",
    });
  });
});

// ============================================================
// Suite C — Round-trip tests
// ============================================================

const baseValidYaml = `title: My Blog
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

describe("roundTripNavConfig — nested nav", () => {
  test("nested nav written then re-parsed → children preserved", () => {
    const nestedNav = [
      {
        label: "Services",
        href: "/services",
        children: [
          { label: "Design", href: "/services/design" },
          { label: "Dev", href: "/services/dev" },
        ],
      },
    ];
    const result = roundTripNavConfig(baseValidYaml, nestedNav);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const reparsed = parseYaml(result.yaml) as Record<string, unknown>;
      expect(reparsed.nav).toEqual(nestedNav);
    }
  });

  test("flat nav written then re-parsed → NO children key on any item", () => {
    const flatNav = [
      { label: "Home", href: "/" },
      { label: "Blog", href: "/blog" },
    ];
    const result = roundTripNavConfig(baseValidYaml, flatNav);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const reparsed = parseYaml(result.yaml) as Record<string, unknown>;
      const nav = reparsed.nav as Record<string, unknown>[];
      for (const item of nav) {
        expect(Object.prototype.hasOwnProperty.call(item, "children")).toBe(
          false
        );
      }
    }
  });
});

describe("FsSiteConfigWriter.writeNav — nested nav", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nested-nav-writer-test-")
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("writeNav with nested nav → file re-parsed equals input nested structure", async () => {
    const configPath = path.join(tmpDir, "site.yaml");
    await fs.writeFile(configPath, baseValidYaml, "utf-8");

    const nestedNav = [
      {
        label: "Services",
        href: "/services",
        children: [
          { label: "Design", href: "/services/design" },
          { label: "Dev", href: "/services/dev" },
        ],
      },
    ];

    const writer = new FsSiteConfigWriter(configPath);
    const result = await writer.writeNav(nestedNav);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(written) as Record<string, unknown>;
    expect(parsed.nav).toEqual(nestedNav);
  });

  test("writeNav with flat nav → no children key emitted (byte-clean backward compat)", async () => {
    const configPath = path.join(tmpDir, "site.yaml");
    await fs.writeFile(configPath, baseValidYaml, "utf-8");

    const flatNav = [{ label: "Home", href: "/" }];

    const writer = new FsSiteConfigWriter(configPath);
    const result = await writer.writeNav(flatNav);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(written) as Record<string, unknown>;
    const nav = parsed.nav as Record<string, unknown>[];
    expect(nav).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(nav[0], "children")).toBe(
      false
    );
  });
});
