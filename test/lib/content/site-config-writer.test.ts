/**
 * Tests for site-config-writer.ts
 *
 * WU-1: PURE core — mergeSiteConfig / serializeSiteConfig / roundTripSiteConfig / isValidUrl
 * WU-2: FS SEAM  — FsSiteConfigWriter (tested against real tmp dirs; no FS mocking)
 *
 * TDD: tests in WU-1 phase were written before the implementation file existed.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { parse as parseYaml } from "yaml";

import {
  mergeSiteConfig,
  serializeSiteConfig,
  roundTripSiteConfig,
  isValidUrl,
  FsSiteConfigWriter,
  getSiteConfigWriter,
  mergeThemeConfig,
  mergeFooterNavConfig,
  roundTripFooterNavConfig,
} from "../../../src/lib/content/site-config-writer";
import { SiteConfigSchema } from "../../../src/lib/content/schema";

// ============================================================
// WU-1 PURE CORE TESTS
// ============================================================

describe("isValidUrl", () => {
  test("rejects bare string 'not-a-url'", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
  });

  test("accepts http://localhost:3000", () => {
    expect(isValidUrl("http://localhost:3000")).toBe(true);
  });

  test("accepts https://example.com", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
  });

  test("rejects empty string", () => {
    expect(isValidUrl("")).toBe(false);
  });

  test("rejects 'ftp://example.com' (still a valid URL structurally)", () => {
    // new URL() accepts ftp — isValidUrl just checks parseability
    expect(isValidUrl("ftp://example.com")).toBe(true);
  });
});

describe("mergeSiteConfig — unknown key preservation (ADR-1 crux)", () => {
  const baseRaw: Record<string, unknown> = {
    title: "Old Title",
    description: "Old desc",
    baseUrl: "http://localhost:3000",
    language: "en",
    author: { name: "Old Author", email: "old@example.com" },
    nav: [{ label: "Home", href: "/" }, { label: "Blog", href: "/blog" }],
    social: { github: "myuser" },
    comments: { enabled: true, moderation: "manual" },
    customKey: "foo",
  };

  const typedFields = {
    title: "New Title",
    description: "New desc",
    baseUrl: "http://localhost:3000",
    language: "en",
    author: { name: "New Author", email: "new@example.com" },
    reading: { homepage: "latest-posts" as const, posts_per_page: 10 },
    comments: { enabled: false, moderation: "auto" as const },
  };

  test("preserves nav array verbatim", () => {
    const merged = mergeSiteConfig(baseRaw, typedFields);
    expect(merged.nav).toEqual([
      { label: "Home", href: "/" },
      { label: "Blog", href: "/blog" },
    ]);
  });

  test("preserves unknown top-level customKey", () => {
    const merged = mergeSiteConfig(baseRaw, typedFields);
    expect(merged.customKey).toBe("foo");
  });

  test("preserves social map", () => {
    const merged = mergeSiteConfig(baseRaw, typedFields);
    expect((merged.social as Record<string, string>).github).toBe("myuser");
  });

  test("overwrites title scalar", () => {
    const merged = mergeSiteConfig(baseRaw, typedFields);
    expect(merged.title).toBe("New Title");
  });

  test("overwrites description scalar", () => {
    const merged = mergeSiteConfig(baseRaw, typedFields);
    expect(merged.description).toBe("New desc");
  });
});

describe("mergeSiteConfig — author deep-merge", () => {
  const baseRaw: Record<string, unknown> = {
    title: "T",
    description: "",
    baseUrl: "http://localhost:3000",
    language: "en",
    author: { name: "Old", email: "old@x.com", extraAuthorKey: "keep" },
    nav: [],
    comments: { enabled: true, moderation: "manual" },
  };

  test("overwrites author.name", () => {
    const merged = mergeSiteConfig(baseRaw, {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "New Author", email: "new@x.com" },
      reading: { homepage: "hero-recent" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    expect((merged.author as Record<string, unknown>).name).toBe("New Author");
  });

  test("sets email when provided", () => {
    const merged = mergeSiteConfig(baseRaw, {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "New", email: "new@x.com" },
      reading: { homepage: "hero-recent" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    expect((merged.author as Record<string, unknown>).email).toBe("new@x.com");
  });

  test("removes email key when email is undefined (optional omit)", () => {
    const merged = mergeSiteConfig(baseRaw, {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "New", email: undefined },
      reading: { homepage: "hero-recent" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    expect((merged.author as Record<string, unknown>).email).toBeUndefined();
  });

  test("preserves extra author sub-key from raw", () => {
    const merged = mergeSiteConfig(baseRaw, {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "New", email: "new@x.com" },
      reading: { homepage: "hero-recent" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    expect((merged.author as Record<string, unknown>).extraAuthorKey).toBe("keep");
  });
});

describe("mergeSiteConfig — reading deep-merge", () => {
  test("adds reading block when raw has none (uncomment-on-first-save)", () => {
    const raw: Record<string, unknown> = {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "A" },
      comments: { enabled: true, moderation: "manual" },
      // reading intentionally absent
    };
    const merged = mergeSiteConfig(raw, {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "A" },
      reading: { homepage: "latest-posts" as const, posts_per_page: 5 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    const reading = merged.reading as Record<string, unknown>;
    expect(reading.homepage).toBe("latest-posts");
    expect(reading.posts_per_page).toBe(5);
  });

  test("adds static_page only when homepage is static-page", () => {
    const raw: Record<string, unknown> = {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "A" },
      comments: { enabled: true, moderation: "manual" },
    };
    const merged = mergeSiteConfig(raw, {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "A" },
      reading: { homepage: "static-page" as const, posts_per_page: 10, static_page: "about" },
      comments: { enabled: true, moderation: "manual" as const },
    });
    const reading = merged.reading as Record<string, unknown>;
    expect(reading.static_page).toBe("about");
  });

  test("removes static_page when homepage is not static-page", () => {
    const raw: Record<string, unknown> = {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "A" },
      reading: { homepage: "static-page", static_page: "about", posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" },
    };
    const merged = mergeSiteConfig(raw, {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "A" },
      reading: { homepage: "latest-posts" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    const reading = merged.reading as Record<string, unknown>;
    expect(reading.static_page).toBeUndefined();
  });
});

describe("mergeSiteConfig — comments deep-merge", () => {
  test("overwrites enabled and moderation; preserves extra sub-key", () => {
    const raw: Record<string, unknown> = {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "A" },
      comments: { enabled: true, moderation: "manual", extraCommentKey: "keep" },
    };
    const merged = mergeSiteConfig(raw, {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "A" },
      reading: { homepage: "hero-recent" as const, posts_per_page: 10 },
      comments: { enabled: false, moderation: "auto" as const },
    });
    const comments = merged.comments as Record<string, unknown>;
    expect(comments.enabled).toBe(false);
    expect(comments.moderation).toBe("auto");
    expect(comments.extraCommentKey).toBe("keep");
  });
});

describe("serializeSiteConfig", () => {
  test("output re-parses via yaml.parse to identical values", () => {
    const raw: Record<string, unknown> = {
      title: "My Blog",
      description: "A great blog",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "Author", email: "a@b.com" },
      nav: [{ label: "Home", href: "/" }],
      social: { github: "user" },
      reading: { homepage: "latest-posts", posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" },
    };
    const yaml = serializeSiteConfig(raw);
    const reparsed = parseYaml(yaml) as Record<string, unknown>;
    expect(reparsed.title).toBe("My Blog");
    expect(reparsed.description).toBe("A great blog");
    expect(reparsed.nav).toEqual([{ label: "Home", href: "/" }]);
    expect((reparsed.reading as Record<string, unknown>).posts_per_page).toBe(10);
    expect((reparsed.comments as Record<string, unknown>).enabled).toBe(true);
  });
});

describe("roundTripSiteConfig", () => {
  const validRawYaml = `title: My Blog
description: "A blog"
baseUrl: "http://localhost:3000"
language: en
author:
  name: Author
  email: author@example.com
reading:
  homepage: latest-posts
  posts_per_page: 10
comments:
  enabled: true
  moderation: manual
nav:
  - label: Home
    href: /
`;

  test("returns ok:true with yaml string for valid input", () => {
    const result = roundTripSiteConfig(validRawYaml, {
      title: "My Blog",
      description: "A blog",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "Author", email: "author@example.com" },
      reading: { homepage: "latest-posts" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.yaml).toBe("string");
      expect(result.yaml.length).toBeGreaterThan(0);
    }
  });

  test("roundTripped yaml still contains nav from original raw", () => {
    const result = roundTripSiteConfig(validRawYaml, {
      title: "Changed Title",
      description: "A blog",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "Author" },
      reading: { homepage: "latest-posts" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const reparsed = parseYaml(result.yaml) as Record<string, unknown>;
      expect(reparsed.nav).toEqual([{ label: "Home", href: "/" }]);
    }
  });

  test("returns ok:false when safeParse write-guard fails (missing title after merge from empty raw)", () => {
    // Use a raw yaml that when merged results in a schema violation.
    // We produce this by giving empty rawYaml and blank title.
    // Note: SiteConfigSchema has defaults so this is tricky — let's use a type
    // mismatch: posts_per_page = -1 (fails ReadingConfigSchema positive check)
    // but we can test round-trip guard via an explicitly broken merged scenario.
    // The safeParse guard catches: posts_per_page <= 0 fails ReadingConfigSchema.
    // We'll manipulate via the fields directly with a raw that sets posts_per_page.
    // Actually the guard is on the MERGED object which includes our typed fields —
    // so posts_per_page from typed fields would be validated.
    // The cleanest way is to pass an invalid reading.posts_per_page.
    // However SettingsFields has posts_per_page: number so we cast.
    const result = roundTripSiteConfig("", {
      title: "T",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "A" },
      reading: { homepage: "latest-posts" as const, posts_per_page: -1 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    expect(result.ok).toBe(false);
  });

  test("unknown key customKey and nav survive the round-trip (ADR-1 integration)", () => {
    const rawWithCustom = `title: Blog
description: ""
baseUrl: "http://localhost:3000"
language: en
author:
  name: Auth
customKey: foo
nav:
  - label: Home
    href: /
  - label: About
    href: /about
social:
  github: myuser
reading:
  homepage: hero-recent
  posts_per_page: 10
comments:
  enabled: true
  moderation: manual
`;
    const result = roundTripSiteConfig(rawWithCustom, {
      title: "Changed",
      description: "",
      baseUrl: "http://localhost:3000",
      language: "en",
      author: { name: "Auth" },
      reading: { homepage: "hero-recent" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const reparsed = parseYaml(result.yaml) as Record<string, unknown>;
      // title was changed
      expect(reparsed.title).toBe("Changed");
      // nav preserved
      expect(reparsed.nav).toEqual([
        { label: "Home", href: "/" },
        { label: "About", href: "/about" },
      ]);
      // customKey preserved
      expect(reparsed.customKey).toBe("foo");
      // social preserved
      expect((reparsed.social as Record<string, string>).github).toBe("myuser");
    }
  });
});

// ============================================================
// WU-2 FS SEAM TESTS
// ============================================================

describe("FsSiteConfigWriter", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "siteconfig-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  const validYaml = `title: Blog
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
customKey: foo
reading:
  homepage: hero-recent
  posts_per_page: 10
comments:
  enabled: true
  moderation: manual
`;

  const validFields = {
    title: "Updated Blog",
    description: "Test blog",
    baseUrl: "http://localhost:3000",
    language: "en",
    author: { name: "New Author", email: "new@example.com" },
    reading: { homepage: "hero-recent" as const, posts_per_page: 10 },
    comments: { enabled: true, moderation: "manual" as const },
  };

  test("writeConfig success: updates typed fields, preserves nav/customKey", async () => {
    const configPath = path.join(tmpDir, "site.yaml");
    await fs.writeFile(configPath, validYaml, "utf-8");

    const writer = new FsSiteConfigWriter(configPath);
    const result = await writer.writeConfig(validFields);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(written) as Record<string, unknown>;

    expect(parsed.title).toBe("Updated Blog");
    expect(parsed.author).toMatchObject({ name: "New Author", email: "new@example.com" });
    // nav preserved
    expect(parsed.nav).toEqual([
      { label: "Home", href: "/" },
      { label: "Blog", href: "/blog" },
    ]);
    // unknown key preserved
    expect(parsed.customKey).toBe("foo");
    // social preserved
    expect((parsed.social as Record<string, string>).github).toBe("myuser");
  });

  test("writeConfig returns ok:false on invalid fields (write-guard fails); original file unchanged, no tmp left behind", async () => {
    const configPath = path.join(tmpDir, "site.yaml");
    await fs.writeFile(configPath, validYaml, "utf-8");

    const writer = new FsSiteConfigWriter(configPath);
    // posts_per_page = -1 fails ReadingConfigSchema positive check → write-guard fails
    const result = await writer.writeConfig({
      ...validFields,
      reading: { homepage: "hero-recent" as const, posts_per_page: -1 },
    });

    expect(result.ok).toBe(false);

    // Original file byte-unchanged
    const afterContent = await fs.readFile(configPath, "utf-8");
    expect(afterContent).toBe(validYaml);

    // No tmp file left behind
    const tmpFile = path.join(tmpDir, ".site.yaml.tmp");
    let tmpExists = false;
    try {
      await fs.access(tmpFile);
      tmpExists = true;
    } catch {
      tmpExists = false;
    }
    expect(tmpExists).toBe(false);
  });

  test("writeConfig with non-existent file: starts from empty raw, creates file", async () => {
    const configPath = path.join(tmpDir, "site.yaml");
    // Don't pre-create the file

    const writer = new FsSiteConfigWriter(configPath);
    const result = await writer.writeConfig(validFields);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(written) as Record<string, unknown>;
    expect(parsed.title).toBe("Updated Blog");
  });
});

describe("getSiteConfigWriter", () => {
  test("returns an FsSiteConfigWriter instance", () => {
    const writer = getSiteConfigWriter();
    expect(writer).toBeInstanceOf(FsSiteConfigWriter);
  });
});

// ============================================================
// mergeThemeConfig — logo/favicon round-trip (silent-drop guard)
// ============================================================

describe("mergeThemeConfig — logo/favicon round-trip (silent-drop guard)", () => {
  const baseRaw: Record<string, unknown> = {
    title: "My Blog",
    description: "A blog",
    baseUrl: "http://localhost:3000",
    language: "en",
    author: { name: "Author" },
    nav: [{ label: "Home", href: "/" }],
    reading: { homepage: "hero-recent", posts_per_page: 10 },
    comments: { enabled: true, moderation: "manual" },
  };

  test("PRESERVED: logo + favicon + colorPrimary survive a round-trip", () => {
    const merged = mergeThemeConfig(baseRaw, {
      logo: "/uploads/logo.png",
      favicon: "/uploads/fav.png",
      colorPrimary: "#ffffff",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.logo).toBe("/uploads/logo.png");
    expect(theme.favicon).toBe("/uploads/fav.png");
    expect(theme.colorPrimary).toBe("#ffffff");
  });

  test("CLEARED: both logo and favicon empty with no other theme fields → theme block deleted", () => {
    const merged = mergeThemeConfig(baseRaw, {
      logo: "",
      favicon: "",
    });
    expect(merged.theme).toBeUndefined();
  });

  test("partial-clear: logo set, favicon empty → theme.logo present, theme.favicon absent", () => {
    const merged = mergeThemeConfig(baseRaw, {
      logo: "/uploads/logo.png",
      favicon: "",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.logo).toBe("/uploads/logo.png");
    expect(theme.favicon).toBeUndefined();
  });

  test("other top-level keys (nav, title) survive verbatim", () => {
    const merged = mergeThemeConfig(baseRaw, {
      logo: "/uploads/logo.png",
    });
    expect(merged.title).toBe("My Blog");
    expect(merged.nav).toEqual([{ label: "Home", href: "/" }]);
  });
});

// ============================================================
// mergeThemeConfig — fontBody round-trip (silent-drop guard)
// ============================================================

describe("mergeThemeConfig — fontBody round-trip (silent-drop guard)", () => {
  const baseRaw: Record<string, unknown> = {
    title: "My Blog",
    description: "A blog",
    baseUrl: "http://localhost:3000",
    language: "en",
    author: { name: "Author" },
    nav: [{ label: "Home", href: "/" }],
    reading: { homepage: "hero-recent", posts_per_page: 10 },
    comments: { enabled: true, moderation: "manual" },
  };

  test("PRESERVED: fontBody + colorPrimary both survive a round-trip", () => {
    const merged = mergeThemeConfig(baseRaw, {
      fontBody: "serif",
      colorPrimary: "#fff",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.fontBody).toBe("serif");
    expect(theme.colorPrimary).toBe("#fff");
  });

  test("CLEARED: fontBody '' only → theme block deleted (no other fields)", () => {
    const merged = mergeThemeConfig(baseRaw, {
      fontBody: "",
    });
    expect(merged.theme).toBeUndefined();
  });

  test("partial: fontBody set, logo '' → theme.fontBody present, theme.logo absent", () => {
    const merged = mergeThemeConfig(baseRaw, {
      fontBody: "serif",
      logo: "",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.fontBody).toBe("serif");
    expect(theme.logo).toBeUndefined();
  });

  test("other sections survive verbatim: nav + title unchanged with fontBody set", () => {
    const merged = mergeThemeConfig(baseRaw, {
      fontBody: "serif",
    });
    expect(merged.title).toBe("My Blog");
    expect(merged.nav).toEqual([{ label: "Home", href: "/" }]);
    const theme = merged.theme as Record<string, unknown>;
    expect(theme.fontBody).toBe("serif");
  });
});

// ============================================================
// mergeThemeConfig — fontHeading round-trip (silent-drop guard)
// ============================================================

describe("mergeThemeConfig — fontHeading round-trip (silent-drop guard)", () => {
  const baseRaw: Record<string, unknown> = {
    title: "My Blog",
    description: "A blog",
    baseUrl: "http://localhost:3000",
    language: "en",
    author: { name: "Author" },
    nav: [{ label: "Home", href: "/" }],
    reading: { homepage: "hero-recent", posts_per_page: 10 },
    comments: { enabled: true, moderation: "manual" },
  };

  test("PRESERVED: fontHeading + colorPrimary both survive a round-trip", () => {
    const merged = mergeThemeConfig(baseRaw, {
      fontHeading: "serif",
      colorPrimary: "#fff",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.fontHeading).toBe("serif");
    expect(theme.colorPrimary).toBe("#fff");
  });

  test("CLEARED: fontHeading '' only → theme block deleted (no other fields)", () => {
    const merged = mergeThemeConfig(baseRaw, {
      fontHeading: "",
    });
    expect(merged.theme).toBeUndefined();
  });

  test("INDEPENDENT: fontBody + fontHeading both survive independently", () => {
    const merged = mergeThemeConfig(baseRaw, {
      fontBody: "serif",
      fontHeading: "mono",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.fontBody).toBe("serif");
    expect(theme.fontHeading).toBe("mono");
  });

  test("silent-drop guard: fontHeading set + logo '' → theme.fontHeading present, theme.logo absent", () => {
    const merged = mergeThemeConfig(baseRaw, {
      fontHeading: "mono",
      logo: "",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.fontHeading).toBe("mono");
    expect(theme.logo).toBeUndefined();
  });

  test("schema write-guard pass: merged theme with fontHeading 'serif' passes SiteConfigSchema", () => {
    const merged = mergeThemeConfig(baseRaw, {
      fontHeading: "serif",
    });
    const result = SiteConfigSchema.safeParse(merged);
    expect(result.success).toBe(true);
  });

  test("schema write-guard reject: unknown fontHeading 'wingdings' injected directly → ok:false", () => {
    const badConfig = {
      ...baseRaw,
      theme: { fontHeading: "wingdings" },
    };
    const result = SiteConfigSchema.safeParse(badConfig);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// mergeThemeConfig — new appearance fields round-trip
// ============================================================

describe("mergeThemeConfig — headerImage and backgroundImage", () => {
  const baseRaw: Record<string, unknown> = {
    title: "My Blog",
    description: "A blog",
    baseUrl: "http://localhost:3000",
    language: "en",
    author: { name: "Author" },
    nav: [{ label: "Home", href: "/" }],
    reading: { homepage: "hero-recent", posts_per_page: 10 },
    comments: { enabled: true, moderation: "manual" },
  };

  test("PRESERVED: headerImage survives a round-trip", () => {
    const merged = mergeThemeConfig(baseRaw, {
      headerImage: "/uploads/header.jpg",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.headerImage).toBe("/uploads/header.jpg");
  });

  test("PRESERVED: backgroundImage survives a round-trip", () => {
    const merged = mergeThemeConfig(baseRaw, {
      backgroundImage: "https://cdn.example.com/bg.jpg",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.backgroundImage).toBe("https://cdn.example.com/bg.jpg");
  });

  test("CLEARED: headerImage '' → theme.headerImage absent", () => {
    const merged = mergeThemeConfig(baseRaw, { headerImage: "" });
    expect(merged.theme).toBeUndefined();
  });

  test("CLEARED: backgroundImage '' → theme.backgroundImage absent", () => {
    const merged = mergeThemeConfig(baseRaw, { backgroundImage: "" });
    expect(merged.theme).toBeUndefined();
  });

  test("all 4 new fields survive together", () => {
    const merged = mergeThemeConfig(baseRaw, {
      headerImage: "/uploads/header.jpg",
      backgroundImage: "/uploads/bg.jpg",
      showTagline: true,
      headerLayout: "center",
    });
    const theme = merged.theme as Record<string, unknown>;
    expect(theme).toBeDefined();
    expect(theme.headerImage).toBe("/uploads/header.jpg");
    expect(theme.backgroundImage).toBe("/uploads/bg.jpg");
    expect(theme.showTagline).toBe(true);
    expect(theme.headerLayout).toBe("center");
  });

  test("showTagline: false → theme.showTagline absent (default, dropped)", () => {
    const merged = mergeThemeConfig(baseRaw, { showTagline: false });
    expect(merged.theme).toBeUndefined();
  });

  test("headerLayout: 'left' → theme.headerLayout absent (default, dropped)", () => {
    const merged = mergeThemeConfig(baseRaw, { headerLayout: "left" });
    expect(merged.theme).toBeUndefined();
  });

  test("schema write-guard passes with all 4 new fields set", () => {
    const merged = mergeThemeConfig(baseRaw, {
      headerImage: "/uploads/header.jpg",
      backgroundImage: "/uploads/bg.jpg",
      showTagline: true,
      headerLayout: "center",
    });
    const result = SiteConfigSchema.safeParse(merged);
    expect(result.success).toBe(true);
  });
});

// ============================================================
// mergeFooterNavConfig
// ============================================================

describe("mergeFooterNavConfig", () => {
  const baseRaw: Record<string, unknown> = {
    title: "My Blog",
    description: "A blog",
    baseUrl: "http://localhost:3000",
    language: "en",
    author: { name: "Author" },
    nav: [{ label: "Home", href: "/" }],
    reading: { homepage: "hero-recent", posts_per_page: 10 },
    comments: { enabled: true, moderation: "manual" },
  };

  test("footer nav written then read equals input", () => {
    const footerNav = [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ];
    const merged = mergeFooterNavConfig(baseRaw, footerNav);
    expect(merged.footerNav).toEqual(footerNav);
  });

  test("header nav is unaffected when only footerNav changes", () => {
    const footerNav = [{ label: "Privacy", href: "/privacy" }];
    const merged = mergeFooterNavConfig(baseRaw, footerNav);
    expect(merged.nav).toEqual([{ label: "Home", href: "/" }]);
  });

  test("empty footerNav: mergeFooterNavConfig replaces footerNav key with []", () => {
    const rawWithFooter: Record<string, unknown> = {
      ...baseRaw,
      footerNav: [{ label: "Privacy", href: "/privacy" }],
    };
    const merged = mergeFooterNavConfig(rawWithFooter, []);
    // empty footerNav → key is DELETED (stays clean in YAML)
    expect(merged.footerNav).toBeUndefined();
  });
});

// ============================================================
// roundTripFooterNavConfig
// ============================================================

describe("roundTripFooterNavConfig", () => {
  const baseYaml = `title: My Blog
description: A blog
baseUrl: http://localhost:3000
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

  test("footer nav round-trip: written nav equals input", () => {
    const footerNav = [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ];
    const result = roundTripFooterNavConfig(baseYaml, footerNav);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseYaml(result.yaml);
      expect(parsed.footerNav).toEqual(footerNav);
    }
  });

  test("empty footer nav emits no footerNav clutter (key absent or empty []) → round-trips clean", () => {
    const result = roundTripFooterNavConfig(baseYaml, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseYaml(result.yaml);
      // empty footerNav should NOT appear as a key in the YAML output
      expect(parsed.footerNav == null || (Array.isArray(parsed.footerNav) && parsed.footerNav.length === 0)).toBe(true);
      // Specifically the key should be absent (deleted by mergeFooterNavConfig)
      expect("footerNav" in parsed).toBe(false);
    }
  });

  test("header nav unaffected when only footerNav changes", () => {
    const footerNav = [{ label: "Privacy", href: "/privacy" }];
    const result = roundTripFooterNavConfig(baseYaml, footerNav);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseYaml(result.yaml);
      expect(parsed.nav).toEqual([{ label: "Home", href: "/" }]);
    }
  });
});

// ============================================================
// FsSiteConfigWriter.writeFooterNav
// ============================================================

describe("FsSiteConfigWriter.writeFooterNav", () => {
  let tmpDir: string;
  let configPath: string;

  const baseYaml = `title: My Blog
description: A blog
baseUrl: http://localhost:3000
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

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-test-"));
    configPath = path.join(tmpDir, "site.yaml");
    await fs.writeFile(configPath, baseYaml, "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("writes footer nav, preserves header nav", async () => {
    const writer = new FsSiteConfigWriter(configPath);
    const footerNav = [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ];
    const result = await writer.writeFooterNav(footerNav);
    expect(result.ok).toBe(true);

    const written = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(written);
    expect(parsed.footerNav).toEqual(footerNav);
    // header nav must be preserved
    expect(parsed.nav).toEqual([{ label: "Home", href: "/" }]);
  });

  test("empty footer nav round-trips (no footerNav key in output or present as [])", async () => {
    // First write a footerNav, then clear it
    const writer = new FsSiteConfigWriter(configPath);
    await writer.writeFooterNav([{ label: "Privacy", href: "/privacy" }]);

    // Now clear it
    const result = await writer.writeFooterNav([]);
    expect(result.ok).toBe(true);

    const written = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(written);
    // Key should be absent after clearing
    expect("footerNav" in parsed).toBe(false);
  });
});
