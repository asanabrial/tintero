import { describe, expect, test } from "bun:test";
import { buildRestoreInput, buildRestorePageInput } from "@/lib/revisions/restore-input";

// ============================================================
// buildRestoreInput — posts pure mapping helper
// ============================================================

const POST_FULL_FRONTMATTER = `---
title: My Post Title
slug: my-post-slug
date: 2024-03-15
status: published
excerpt: A short excerpt
tags:
  - typescript
  - testing
categories:
  - tech
comments: false
---

This is the post body.
With multiple lines.
`;

describe("buildRestoreInput — well-formed frontmatter", () => {
  test("returns correct title", () => {
    const result = buildRestoreInput(POST_FULL_FRONTMATTER);
    expect(result.title).toBe("My Post Title");
  });

  test("returns correct slug", () => {
    const result = buildRestoreInput(POST_FULL_FRONTMATTER);
    expect(result.slug).toBe("my-post-slug");
  });

  test("returns correct date string", () => {
    const result = buildRestoreInput(POST_FULL_FRONTMATTER);
    // gray-matter parses YAML dates as Date objects — check yyyy-mm-dd
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.date).toBe("2024-03-15");
  });

  test("returns correct status", () => {
    const result = buildRestoreInput(POST_FULL_FRONTMATTER);
    expect(result.status).toBe("published");
  });

  test("returns correct excerpt", () => {
    const result = buildRestoreInput(POST_FULL_FRONTMATTER);
    expect(result.excerpt).toBe("A short excerpt");
  });

  test("returns correct tags array", () => {
    const result = buildRestoreInput(POST_FULL_FRONTMATTER);
    expect(result.tags).toEqual(["typescript", "testing"]);
  });

  test("returns correct categories array", () => {
    const result = buildRestoreInput(POST_FULL_FRONTMATTER);
    expect(result.categories).toEqual(["tech"]);
  });

  test("returns correct comments boolean", () => {
    const result = buildRestoreInput(POST_FULL_FRONTMATTER);
    expect(result.comments).toBe(false);
  });

  test("returns body (trimmed leading newline from gray-matter content)", () => {
    const result = buildRestoreInput(POST_FULL_FRONTMATTER);
    expect(result.body).toContain("This is the post body.");
  });
});

describe("buildRestoreInput — missing frontmatter fields (defaults)", () => {
  test("title defaults to empty string when absent", () => {
    const result = buildRestoreInput("---\ndate: 2024-01-01\n---\nBody");
    expect(result.title).toBe("");
  });

  test("slug is undefined when absent", () => {
    const result = buildRestoreInput("---\ntitle: T\ndate: 2024-01-01\n---\nBody");
    expect(result.slug).toBeUndefined();
  });

  test("status defaults to draft when absent or invalid", () => {
    const result = buildRestoreInput("---\ntitle: T\ndate: 2024-01-01\n---\nBody");
    expect(result.status).toBe("draft");
  });

  test("tags defaults to empty array when absent", () => {
    const result = buildRestoreInput("---\ntitle: T\ndate: 2024-01-01\n---\nBody");
    expect(result.tags).toEqual([]);
  });

  test("categories defaults to empty array when absent", () => {
    const result = buildRestoreInput("---\ntitle: T\ndate: 2024-01-01\n---\nBody");
    expect(result.categories).toEqual([]);
  });

  test("comments defaults to true when absent", () => {
    const result = buildRestoreInput("---\ntitle: T\ndate: 2024-01-01\n---\nBody");
    expect(result.comments).toBe(true);
  });

  test("date defaults to today's ISO date when absent", () => {
    const result = buildRestoreInput("---\ntitle: T\n---\nBody");
    const today = new Date().toISOString().slice(0, 10);
    expect(result.date).toBe(today);
  });

  test("no throw even with empty frontmatter", () => {
    expect(() => buildRestoreInput("---\n---\nBody")).not.toThrow();
  });
});

describe("buildRestoreInput — malformed YAML", () => {
  test("does not throw on malformed YAML", () => {
    expect(() => buildRestoreInput("---\n: invalid: yaml: [\n---\nBody")).not.toThrow();
  });

  test("returns body = rawContent when YAML parsing fails", () => {
    const raw = "---\n: invalid: yaml: [\n---\nBody";
    const result = buildRestoreInput(raw);
    // On malformed YAML: body is the raw content, defaults for everything else
    expect(result.body).toBe(raw);
  });

  test("title defaults to empty string on malformed YAML", () => {
    const result = buildRestoreInput("---\n: invalid: yaml: [\n---\nBody");
    expect(result.title).toBe("");
  });

  test("status defaults to draft on malformed YAML", () => {
    const result = buildRestoreInput("---\n: invalid: yaml: [\n---\nBody");
    expect(result.status).toBe("draft");
  });
});

describe("buildRestoreInput — Date-typed date field", () => {
  test("Date object from gray-matter is converted to ISO yyyy-mm-dd", () => {
    // gray-matter parses YAML date values as JS Date objects
    const raw = `---
title: T
date: 2023-07-04
status: draft
tags: []
categories: []
comments: true
---
Body
`;
    const result = buildRestoreInput(raw);
    expect(result.date).toBe("2023-07-04");
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("buildRestoreInput — pure function (no side effects)", () => {
  test("calling twice with same input returns identical result", () => {
    const raw = POST_FULL_FRONTMATTER;
    const r1 = buildRestoreInput(raw);
    const r2 = buildRestoreInput(raw);
    expect(r1).toEqual(r2);
  });
});

// ============================================================
// buildRestorePageInput — pages pure mapping helper
// ============================================================

const PAGE_FULL_FRONTMATTER = `---
title: About Us
slug: about
date: 2024-06-01
excerpt: Learn more about us
---

Welcome to our company page.
`;

describe("buildRestorePageInput — well-formed page frontmatter", () => {
  test("returns correct title", () => {
    const result = buildRestorePageInput(PAGE_FULL_FRONTMATTER);
    expect(result.title).toBe("About Us");
  });

  test("returns correct slug", () => {
    const result = buildRestorePageInput(PAGE_FULL_FRONTMATTER);
    expect(result.slug).toBe("about");
  });

  test("returns correct date", () => {
    const result = buildRestorePageInput(PAGE_FULL_FRONTMATTER);
    expect(result.date).toBe("2024-06-01");
  });

  test("returns correct excerpt", () => {
    const result = buildRestorePageInput(PAGE_FULL_FRONTMATTER);
    expect(result.excerpt).toBe("Learn more about us");
  });

  test("returns body", () => {
    const result = buildRestorePageInput(PAGE_FULL_FRONTMATTER);
    expect(result.body).toContain("Welcome to our company page.");
  });

  test("does NOT include status field", () => {
    const result = buildRestorePageInput(PAGE_FULL_FRONTMATTER);
    expect("status" in result).toBe(false);
  });

  test("does NOT include tags field", () => {
    const result = buildRestorePageInput(PAGE_FULL_FRONTMATTER);
    expect("tags" in result).toBe(false);
  });

  test("does NOT include categories field", () => {
    const result = buildRestorePageInput(PAGE_FULL_FRONTMATTER);
    expect("categories" in result).toBe(false);
  });

  test("does NOT include comments field", () => {
    const result = buildRestorePageInput(PAGE_FULL_FRONTMATTER);
    expect("comments" in result).toBe(false);
  });
});

describe("buildRestorePageInput — missing fields (defaults)", () => {
  test("title defaults to empty string", () => {
    const result = buildRestorePageInput("---\ndate: 2024-01-01\n---\nBody");
    expect(result.title).toBe("");
  });

  test("slug is undefined when absent", () => {
    const result = buildRestorePageInput("---\ntitle: T\ndate: 2024-01-01\n---\nBody");
    expect(result.slug).toBeUndefined();
  });

  test("date defaults to today when absent", () => {
    const result = buildRestorePageInput("---\ntitle: T\n---\nBody");
    const today = new Date().toISOString().slice(0, 10);
    expect(result.date).toBe(today);
  });

  test("excerpt is undefined when absent", () => {
    const result = buildRestorePageInput("---\ntitle: T\ndate: 2024-01-01\n---\nBody");
    expect(result.excerpt).toBeUndefined();
  });

  test("no throw with empty frontmatter", () => {
    expect(() => buildRestorePageInput("---\n---\nBody")).not.toThrow();
  });
});

describe("buildRestorePageInput — malformed YAML", () => {
  test("does not throw on malformed YAML", () => {
    expect(() => buildRestorePageInput("---\n: invalid: yaml: [\n---\nBody")).not.toThrow();
  });

  test("body = rawContent on malformed YAML", () => {
    const raw = "---\n: invalid: yaml: [\n---\nBody";
    const result = buildRestorePageInput(raw);
    expect(result.body).toBe(raw);
  });

  test("title defaults to empty string on malformed YAML", () => {
    const result = buildRestorePageInput("---\n: invalid: yaml: [\n---\nBody");
    expect(result.title).toBe("");
  });
});
