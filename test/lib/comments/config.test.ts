import { describe, expect, spyOn, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { CommentsConfigSchema, PostFrontmatterSchema, SiteConfigSchema } from "../../../src/lib/content/schema";
import { loadSiteConfig } from "../../../src/lib/content/site-config";

const FIXTURES_DIR = path.join(import.meta.dir, "../../fixtures");

async function writeTmpYaml(name: string, content: string): Promise<string> {
  const tmpPath = path.join(FIXTURES_DIR, name);
  await fs.writeFile(tmpPath, content);
  return tmpPath;
}

async function removeTmp(tmpPath: string): Promise<void> {
  await fs.unlink(tmpPath).catch(() => {});
}

describe("CommentsConfigSchema", () => {
  test("absent value (null) yields defaults { enabled: true, moderation: 'manual' }", () => {
    const result = CommentsConfigSchema.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.moderation).toBe("manual");
    }
  });

  test("undefined yields defaults", () => {
    const result = CommentsConfigSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.moderation).toBe("manual");
    }
  });

  test("empty object yields defaults", () => {
    const result = CommentsConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.moderation).toBe("manual");
    }
  });

  test("valid { enabled: false, moderation: 'auto' } passes", () => {
    const result = CommentsConfigSchema.safeParse({ enabled: false, moderation: "auto" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
      expect(result.data.moderation).toBe("auto");
    }
  });

  test("invalid moderation value fails", () => {
    const result = CommentsConfigSchema.safeParse({ moderation: "invalid_value" });
    expect(result.success).toBe(false);
  });
});

describe("SiteConfigSchema — comments field", () => {
  test("absent comments block yields defaults", () => {
    const result = SiteConfigSchema.safeParse({ title: "T", description: "D", baseUrl: "http://x", language: "en", author: { name: "A" }, nav: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comments.enabled).toBe(true);
      expect(result.data.comments.moderation).toBe("manual");
    }
  });

  test("valid comments block is applied", () => {
    const result = SiteConfigSchema.safeParse({
      title: "T", description: "D", baseUrl: "http://x", language: "en", author: { name: "A" }, nav: [],
      comments: { enabled: false, moderation: "auto" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comments.enabled).toBe(false);
      expect(result.data.comments.moderation).toBe("auto");
    }
  });
});

describe("PostFrontmatterSchema — comments field", () => {
  test("absent comments field defaults to true", () => {
    const result = PostFrontmatterSchema.safeParse({ title: "Hello", date: "2024-01-15" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comments).toBe(true);
    }
  });

  test("comments: false is preserved", () => {
    const result = PostFrontmatterSchema.safeParse({ title: "Hello", date: "2024-01-15", comments: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comments).toBe(false);
    }
  });

  test("comments: true is preserved", () => {
    const result = PostFrontmatterSchema.safeParse({ title: "Hello", date: "2024-01-15", comments: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comments).toBe(true);
    }
  });
});

describe("loadSiteConfig — comments integration", () => {
  test("site.yaml missing comments block → defaults { enabled: true, moderation: 'manual' }", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const tmpPath = await writeTmpYaml(
      "site-no-comments.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\n`
    );
    try {
      const config = await loadSiteConfig(tmpPath);
      expect(config.comments.enabled).toBe(true);
      expect(config.comments.moderation).toBe("manual");
    } finally {
      await removeTmp(tmpPath);
      spy.mockRestore();
    }
  });

  test("comments block with invalid moderation → warn + fallback to defaults", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const tmpPath = await writeTmpYaml(
      "site-invalid-comments.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\ncomments:\n  moderation: invalid_value\n`
    );
    try {
      const config = await loadSiteConfig(tmpPath);
      expect(spy).toHaveBeenCalled();
      expect(config.comments.enabled).toBe(true);
      expect(config.comments.moderation).toBe("manual");
    } finally {
      await removeTmp(tmpPath);
      spy.mockRestore();
    }
  });

  test("valid comments block in site.yaml is applied", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const tmpPath = await writeTmpYaml(
      "site-valid-comments.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\ncomments:\n  enabled: false\n  moderation: auto\n`
    );
    try {
      const config = await loadSiteConfig(tmpPath);
      expect(config.comments.enabled).toBe(false);
      expect(config.comments.moderation).toBe("auto");
    } finally {
      await removeTmp(tmpPath);
      spy.mockRestore();
    }
  });

  test("comments key does NOT trigger unknown-key warning", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const tmpPath = await writeTmpYaml(
      "site-comments-no-warn.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\ncomments:\n  enabled: true\n  moderation: manual\n`
    );
    try {
      await loadSiteConfig(tmpPath);
      const warnCalls = spy.mock.calls.map((args) => String(args[0]));
      const unknownKeyWarn = warnCalls.some(
        (msg) => msg.includes("unknown key") && msg.includes("comments")
      );
      expect(unknownKeyWarn).toBe(false);
    } finally {
      await removeTmp(tmpPath);
      spy.mockRestore();
    }
  });
});
