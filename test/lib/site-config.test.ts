import { describe, expect, spyOn, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { loadSiteConfig } from "../../src/lib/content/site-config";

const FIXTURES_DIR = path.join(__dirname, "../fixtures");

async function writeTmpYaml(name: string, content: string): Promise<string> {
  const tmpPath = path.join(FIXTURES_DIR, name);
  await fs.writeFile(tmpPath, content);
  return tmpPath;
}

async function removeTmp(tmpPath: string): Promise<void> {
  await fs.unlink(tmpPath).catch(() => {});
}

describe("loadSiteConfig", () => {
  test("valid site.yaml returns a SiteConfig object with all fields", async () => {
    const configPath = path.join(
      __dirname,
      "../../config/site.yaml"
    );
    const config = await loadSiteConfig(configPath);
    expect(config.title).toBeDefined();
    expect(config.description).toBeDefined();
    expect(config.baseUrl).toBeDefined();
    expect(config.language).toBeDefined();
    expect(config.author).toBeDefined();
    expect(config.nav).toBeArray();
  });

  test("unknown key in site.yaml warns to console and does not throw", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    // Write a temporary config with an unknown key
    const fs = await import("fs/promises");
    const tmpPath = path.join(FIXTURES_DIR, "site-unknown-key.yaml");
    await fs.writeFile(
      tmpPath,
      `title: Test\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\nfutureFeature: true\n`
    );
    try {
      const config = await loadSiteConfig(tmpPath);
      expect(config.title).toBe("Test");
      expect(spy).toHaveBeenCalled();
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
      spy.mockRestore();
    }
  });

  test("missing site.yaml file returns schema defaults without throwing", async () => {
    const config = await loadSiteConfig("/nonexistent/path/site.yaml");
    expect(config).toBeDefined();
    expect(config.title).toBeDefined();
    expect(config.nav).toBeArray();
  });

  test("loadSiteConfig: absent reading block yields hero-recent/10 defaults", async () => {
    const tmpPath = await writeTmpYaml(
      "site-no-reading.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\n`
    );
    try {
      const config = await loadSiteConfig(tmpPath);
      expect(config.reading.homepage).toBe("hero-recent");
      expect(config.reading.posts_per_page).toBe(10);
      expect(config.reading.static_page).toBeUndefined();
    } finally {
      await removeTmp(tmpPath);
    }
  });

  test("loadSiteConfig: valid reading block is parsed onto config", async () => {
    const tmpPath = await writeTmpYaml(
      "site-valid-reading.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\nreading:\n  homepage: latest-posts\n  posts_per_page: 5\n`
    );
    try {
      const spy = spyOn(console, "warn").mockImplementation(() => {});
      const config = await loadSiteConfig(tmpPath);
      spy.mockRestore();
      expect(config.reading.homepage).toBe("latest-posts");
      expect(config.reading.posts_per_page).toBe(5);
    } finally {
      await removeTmp(tmpPath);
    }
  });

  test("loadSiteConfig: reading key does NOT trigger unknown-key warning", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const tmpPath = await writeTmpYaml(
      "site-reading-known.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\nreading:\n  homepage: hero-recent\n  posts_per_page: 10\n`
    );
    try {
      await loadSiteConfig(tmpPath);
      const warnCalls = spy.mock.calls.map((args) => String(args[0]));
      const unknownKeyWarn = warnCalls.some(
        (msg) => msg.includes("unknown key") && msg.includes("reading")
      );
      expect(unknownKeyWarn).toBe(false);
    } finally {
      await removeTmp(tmpPath);
      spy.mockRestore();
    }
  });

  test("loadSiteConfig: invalid posts_per_page resets reading to defaults but title/nav preserved", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const tmpPath = await writeTmpYaml(
      "site-bad-posts-per-page.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\nreading:\n  posts_per_page: 0\n`
    );
    try {
      const config = await loadSiteConfig(tmpPath);
      expect(config.reading.posts_per_page).toBe(10);
      expect(config.reading.homepage).toBe("hero-recent");
      expect(config.title).toBe("My Blog");
      expect(spy).toHaveBeenCalled();
    } finally {
      await removeTmp(tmpPath);
      spy.mockRestore();
    }
  });

  test("loadSiteConfig: homepage static-page without static_page resets reading to defaults but base config intact", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const tmpPath = await writeTmpYaml(
      "site-static-page-no-slug.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\nreading:\n  homepage: static-page\n`
    );
    try {
      const config = await loadSiteConfig(tmpPath);
      expect(config.reading.homepage).toBe("hero-recent");
      expect(config.title).toBe("My Blog");
      expect(spy).toHaveBeenCalled();
    } finally {
      await removeTmp(tmpPath);
      spy.mockRestore();
    }
  });

  test("loadSiteConfig: invalid reading block emits exactly one console.warn", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const tmpPath = await writeTmpYaml(
      "site-invalid-reading-warn.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\nreading:\n  homepage: bad-enum-value\n`
    );
    try {
      await loadSiteConfig(tmpPath);
      const readingWarnCalls = spy.mock.calls.filter((args) =>
        String(args[0]).includes("invalid reading settings")
      );
      expect(readingWarnCalls.length).toBe(1);
    } finally {
      await removeTmp(tmpPath);
      spy.mockRestore();
    }
  });

  test("loadSiteConfig: partial reading block fills missing fields with defaults", async () => {
    const tmpPath = await writeTmpYaml(
      "site-partial-reading.yaml",
      `title: My Blog\ndescription: Desc\nbaseUrl: http://localhost\nlanguage: en\nauthor:\n  name: Author\nnav: []\nreading:\n  posts_per_page: 20\n`
    );
    try {
      const spy = spyOn(console, "warn").mockImplementation(() => {});
      const config = await loadSiteConfig(tmpPath);
      spy.mockRestore();
      expect(config.reading.homepage).toBe("hero-recent");
      expect(config.reading.posts_per_page).toBe(20);
    } finally {
      await removeTmp(tmpPath);
    }
  });
});
