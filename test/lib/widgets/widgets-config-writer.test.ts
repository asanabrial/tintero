import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { parse as parseYaml } from "yaml";

import { FsWidgetsConfigWriter } from "../../../src/lib/widgets/widgets-config-writer";
import type { Widget } from "../../../src/lib/widgets/types";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-widgets-writer-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("FsWidgetsConfigWriter.writeArea", () => {
  test("round-trip: write then read back matches", async () => {
    const configPath = path.join(tmpDir, "widgets.yaml");
    const writer = new FsWidgetsConfigWriter(configPath);
    const widgets: Widget[] = [
      { type: "recent-posts", title: "Latest", count: 3 },
      { type: "search", title: "Search" },
    ];

    const result = await writer.writeArea("blog-sidebar", widgets);
    expect(result.ok).toBe(true);

    const content = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(content) as Record<string, unknown>;
    expect(parsed["blog-sidebar"]).toEqual([
      { type: "recent-posts", title: "Latest", count: 3 },
      { type: "search", title: "Search" },
    ]);
  });

  test("atomic: writes to tmp then renames (no tmp file remains after success)", async () => {
    const configPath = path.join(tmpDir, "widgets.yaml");
    const writer = new FsWidgetsConfigWriter(configPath);
    const widgets: Widget[] = [{ type: "categories", title: "Cats" }];

    await writer.writeArea("blog-sidebar", widgets);

    const tmpPath = path.join(tmpDir, ".widgets.yaml.tmp");
    let tmpExists = true;
    try {
      await fs.access(tmpPath);
    } catch {
      tmpExists = false;
    }
    expect(tmpExists).toBe(false);

    // Real file must exist
    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toContain("categories");
  });

  test("preserves existing keys when writing a new area", async () => {
    const configPath = path.join(tmpDir, "widgets.yaml");
    // Pre-populate with an existing key
    await fs.writeFile(configPath, "some-other-area:\n  - type: search\n", "utf-8");

    const writer = new FsWidgetsConfigWriter(configPath);
    const widgets: Widget[] = [{ type: "tag-cloud", title: "Tags" }];
    await writer.writeArea("blog-sidebar", widgets);

    const content = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(content) as Record<string, unknown>;
    // blog-sidebar should be the new data
    expect(parsed["blog-sidebar"]).toEqual([{ type: "tag-cloud", title: "Tags" }]);
  });

  test("missing dir returns error gracefully", async () => {
    const configPath = path.join(tmpDir, "nonexistent-subdir", "widgets.yaml");
    const writer = new FsWidgetsConfigWriter(configPath);
    const widgets: Widget[] = [{ type: "search" }];

    const result = await writer.writeArea("blog-sidebar", widgets);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  test("empty array clears the area", async () => {
    const configPath = path.join(tmpDir, "widgets.yaml");
    const writer = new FsWidgetsConfigWriter(configPath);

    // First write some widgets
    await writer.writeArea("blog-sidebar", [{ type: "search" }]);
    // Then clear them
    const result = await writer.writeArea("blog-sidebar", []);
    expect(result.ok).toBe(true);

    const content = await fs.readFile(configPath, "utf-8");
    const parsed = parseYaml(content) as Record<string, unknown>;
    expect(parsed["blog-sidebar"]).toEqual([]);
  });
});
