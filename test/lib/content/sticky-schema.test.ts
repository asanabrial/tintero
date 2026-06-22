import { describe, expect, test } from "bun:test";
import { PostFrontmatterSchema } from "../../../src/lib/content/schema";
import {
  serializeFrontmatter,
  type SerializableFrontmatter,
} from "../../../src/lib/content/fs-writer";

// ============================================================
// Schema tests: sticky field
// ============================================================

describe("PostFrontmatterSchema — sticky field", () => {
  const baseValid = {
    title: "Hello",
    date: "2024-06-01",
  };

  test("defaults to false when absent (old post backward compat)", () => {
    const result = PostFrontmatterSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sticky).toBe(false);
    }
  });

  test("accepts sticky: true", () => {
    const result = PostFrontmatterSchema.safeParse({ ...baseValid, sticky: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sticky).toBe(true);
    }
  });

  test("accepts sticky: false explicitly", () => {
    const result = PostFrontmatterSchema.safeParse({ ...baseValid, sticky: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sticky).toBe(false);
    }
  });

  test("old post without sticky key validates and is non-sticky", () => {
    // Simulate a post with no sticky key at all
    const raw = { title: "Old Post", date: "2020-01-15" };
    const result = PostFrontmatterSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sticky).toBe(false);
    }
  });
});

// ============================================================
// Writer tests: sticky omit-when-false pattern
// ============================================================

describe("serializeFrontmatter — sticky YAML output", () => {
  const baseFm: SerializableFrontmatter = {
    title: "Test Post",
    date: "2024-06-01",
    status: "published",
    tags: [],
    categories: ["Uncategorized"],
    comments: true,
  };

  test("non-sticky post (sticky omitted) produces no 'sticky:' line in YAML", () => {
    const yaml = serializeFrontmatter(baseFm);
    expect(yaml).not.toContain("sticky:");
  });

  test("non-sticky post with sticky:false produces no 'sticky:' line in YAML", () => {
    const yaml = serializeFrontmatter({ ...baseFm, sticky: false });
    expect(yaml).not.toContain("sticky:");
  });

  test("sticky:true post produces 'sticky: true' in YAML", () => {
    const yaml = serializeFrontmatter({ ...baseFm, sticky: true });
    expect(yaml).toContain("sticky: true");
  });

  test("date still round-trips as string (regression guard)", () => {
    // YAML 1.1 must quote date-like strings so gray-matter reads them as strings.
    // serializeFrontmatter wraps yamlStringify with version: "1.1".
    const yaml = serializeFrontmatter({ ...baseFm, sticky: true, date: "2026-06-18" });
    // The date must appear quoted in the YAML output so gray-matter doesn't parse it as a Date object
    expect(yaml).toMatch(/'2026-06-18'|"2026-06-18"/);
  });
});
