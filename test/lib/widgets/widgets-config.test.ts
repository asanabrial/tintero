import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// We test against a real tmp dir — no mocking needed since loadWidgetsConfig accepts an optional filePath
import { loadWidgetsConfig } from "../../../src/lib/widgets/widgets-config";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-widgets-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("loadWidgetsConfig", () => {
  test("missing file returns empty blog-sidebar", async () => {
    const result = await loadWidgetsConfig(path.join(tmpDir, "nonexistent.yaml"));
    expect(result).toEqual({ "blog-sidebar": [] });
  });

  test("valid YAML parses correctly", async () => {
    const yaml = `
blog-sidebar:
  - type: recent-posts
    title: Recent Posts
    count: 5
  - type: search
    title: Search
`;
    const filePath = path.join(tmpDir, "widgets.yaml");
    await fs.writeFile(filePath, yaml, "utf-8");
    const result = await loadWidgetsConfig(filePath);
    expect(result["blog-sidebar"]).toHaveLength(2);
    expect(result["blog-sidebar"][0].type).toBe("recent-posts");
    expect(result["blog-sidebar"][0].title).toBe("Recent Posts");
    expect(result["blog-sidebar"][0].count).toBe(5);
    expect(result["blog-sidebar"][1].type).toBe("search");
  });

  test("malformed YAML returns empty blog-sidebar", async () => {
    const filePath = path.join(tmpDir, "widgets.yaml");
    await fs.writeFile(filePath, "{ this is not: valid yaml: [", "utf-8");
    const result = await loadWidgetsConfig(filePath);
    expect(result).toEqual({ "blog-sidebar": [] });
  });

  test("invalid widget in array is dropped, valid ones survive", async () => {
    const yaml = `
blog-sidebar:
  - type: recent-posts
    title: Good Widget
  - type: totally-invalid-widget-type
  - type: categories
    title: Categories
`;
    const filePath = path.join(tmpDir, "widgets.yaml");
    await fs.writeFile(filePath, yaml, "utf-8");
    const result = await loadWidgetsConfig(filePath);
    expect(result["blog-sidebar"]).toHaveLength(2);
    expect(result["blog-sidebar"][0].type).toBe("recent-posts");
    expect(result["blog-sidebar"][1].type).toBe("categories");
  });

  test("empty YAML file returns empty blog-sidebar", async () => {
    const filePath = path.join(tmpDir, "widgets.yaml");
    await fs.writeFile(filePath, "", "utf-8");
    const result = await loadWidgetsConfig(filePath);
    expect(result).toEqual({ "blog-sidebar": [] });
  });
});
