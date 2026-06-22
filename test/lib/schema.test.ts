import { describe, expect, spyOn, test } from "bun:test";
import { parsePostFrontmatter, PostFrontmatterSchema, ReadingConfigSchema, SiteConfigSchema } from "../../src/lib/content/schema";

describe("ReadingConfigSchema", () => {
  test("empty object yields hero-recent defaults", () => {
    const result = ReadingConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.homepage).toBe("hero-recent");
      expect(result.data.posts_per_page).toBe(10);
      expect(result.data.static_page).toBeUndefined();
    }
  });

  test("valid all-fields parses correctly", () => {
    const result = ReadingConfigSchema.safeParse({
      homepage: "latest-posts",
      posts_per_page: 5,
      static_page: "about",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.homepage).toBe("latest-posts");
      expect(result.data.posts_per_page).toBe(5);
      expect(result.data.static_page).toBe("about");
    }
  });

  test("partial block fills missing fields with defaults", () => {
    const result = ReadingConfigSchema.safeParse({ posts_per_page: 20 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.homepage).toBe("hero-recent");
      expect(result.data.posts_per_page).toBe(20);
      expect(result.data.static_page).toBeUndefined();
    }
  });

  test("homepage static-page without static_page fails refine", () => {
    const result = ReadingConfigSchema.safeParse({ homepage: "static-page" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("static_page");
    }
  });

  test("homepage static-page with static_page passes", () => {
    const result = ReadingConfigSchema.safeParse({
      homepage: "static-page",
      static_page: "about",
    });
    expect(result.success).toBe(true);
  });

  test("posts_per_page 0 is invalid", () => {
    const result = ReadingConfigSchema.safeParse({ posts_per_page: 0 });
    expect(result.success).toBe(false);
  });

  test("posts_per_page negative is invalid", () => {
    const result = ReadingConfigSchema.safeParse({ posts_per_page: -1 });
    expect(result.success).toBe(false);
  });

  test("posts_per_page non-integer is invalid", () => {
    const result = ReadingConfigSchema.safeParse({ posts_per_page: 2.5 });
    expect(result.success).toBe(false);
  });

  test("unknown homepage enum value is invalid", () => {
    const result = ReadingConfigSchema.safeParse({ homepage: "unknown-mode" });
    expect(result.success).toBe(false);
  });
});

describe("SiteConfigSchema", () => {
  test("absent reading block yields reading defaults on full config parse", () => {
    const result = SiteConfigSchema.safeParse({
      title: "Test",
      description: "Desc",
      baseUrl: "http://localhost",
      language: "en",
      author: { name: "Author" },
      nav: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reading.homepage).toBe("hero-recent");
      expect(result.data.reading.posts_per_page).toBe(10);
    }
  });
});

describe("parsePostFrontmatter", () => {
  test("valid required fields return a PostFrontmatter object", () => {
    const result = parsePostFrontmatter(
      { title: "Hello", date: "2024-01-15" },
      "test.md"
    );
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Hello");
    expect(result!.date).toBe("2024-01-15");
  });

  test("missing title returns null and warns to stderr", () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const result = parsePostFrontmatter({ date: "2024-01-15" }, "no-title.md");
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("invalid date format returns null and warns to stderr", () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const result = parsePostFrontmatter(
      { title: "Hello", date: "not-a-date" },
      "bad-date.md"
    );
    expect(result).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test("status defaults to published when not specified", () => {
    const result = parsePostFrontmatter(
      { title: "Hello", date: "2024-01-15" },
      "test.md"
    );
    expect(result!.status).toBe("published");
  });

  test("tags default to empty array when not specified", () => {
    const result = parsePostFrontmatter(
      { title: "Hello", date: "2024-01-15" },
      "test.md"
    );
    expect(result!.tags).toEqual([]);
  });

  test("draft status is recognized", () => {
    const result = parsePostFrontmatter(
      { title: "Draft", date: "2024-01-15", status: "draft" },
      "draft.md"
    );
    expect(result!.status).toBe("draft");
  });

  test("excerpt field is preserved when present", () => {
    const result = parsePostFrontmatter(
      { title: "Hello", date: "2024-01-15", excerpt: "My custom excerpt" },
      "test.md"
    );
    expect(result!.excerpt).toBe("My custom excerpt");
  });

  test("absent categories field defaults to [\"Uncategorized\"]", () => {
    const result = parsePostFrontmatter(
      { title: "Hello", date: "2024-01-15" },
      "test.md"
    );
    expect(result).not.toBeNull();
    expect(result!.categories).toEqual(["Uncategorized"]);
  });

  test("categories:[] (empty array) coerces to [\"Uncategorized\"]", () => {
    const result = parsePostFrontmatter(
      { title: "Hello", date: "2024-01-15", categories: [] },
      "test.md"
    );
    expect(result).not.toBeNull();
    expect(result!.categories).toEqual(["Uncategorized"]);
  });

  test("explicit categories are preserved as array of strings", () => {
    const result = parsePostFrontmatter(
      { title: "Hello", date: "2024-01-15", categories: ["Tech", "Open Source"] },
      "test.md"
    );
    expect(result).not.toBeNull();
    expect(result!.categories).toEqual(["Tech", "Open Source"]);
  });

  test("whitespace-only category entries are discarded; all-blank coerces to [\"Uncategorized\"]", () => {
    const result = parsePostFrontmatter(
      { title: "Hello", date: "2024-01-15", categories: ["  ", ""] },
      "test.md"
    );
    expect(result).not.toBeNull();
    expect(result!.categories).toEqual(["Uncategorized"]);
  });
});

// ============================================================
// PostFrontmatterSchema — authorId field (RBAC)
// ============================================================

describe("PostFrontmatterSchema — authorId field", () => {
  test("valid UUID authorId is accepted and preserved", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
      authorId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.authorId).toBe("550e8400-e29b-41d4-a716-446655440000");
    }
  });

  test("absent authorId is accepted (optional field, pre-RBAC posts)", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.authorId).toBeUndefined();
    }
  });

  test("invalid authorId (not a UUID) is rejected", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
      authorId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const authorIdIssue = result.error.issues.find((i) =>
        i.path.includes("authorId")
      );
      expect(authorIdIssue).toBeDefined();
    }
  });
});

// ============================================================
// PostFrontmatterSchema — coverImage field
// ============================================================

describe("PostFrontmatterSchema — coverImage field", () => {
  test("coverImage accepts a /uploads/ path", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
      coverImage: "/uploads/x.jpg",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverImage).toBe("/uploads/x.jpg");
    }
  });

  test("coverImage accepts an https URL", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
      coverImage: "https://example.com/img.jpg",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverImage).toBe("https://example.com/img.jpg");
    }
  });

  test("coverImage accepts an http URL", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
      coverImage: "http://example.com/img.jpg",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverImage).toBe("http://example.com/img.jpg");
    }
  });

  test("coverImage rejects javascript: URL", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
      coverImage: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  test("coverImage rejects data: URL", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
      coverImage: "data:image/png;base64,abc",
    });
    expect(result.success).toBe(false);
  });

  test("coverImage omitted is not an error — field is simply unset", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverImage).toBeUndefined();
    }
  });

  test("empty string coverImage is treated as unset (not an error)", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "My Post",
      date: "2024-01-01",
      coverImage: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverImage).toBeUndefined();
    }
  });

  test("post without coverImage still validates (backward compat)", () => {
    const result = PostFrontmatterSchema.safeParse({
      title: "Legacy Post",
      date: "2023-06-01",
      status: "published",
      tags: ["a"],
      categories: ["Tech"],
      excerpt: "Some excerpt",
      comments: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverImage).toBeUndefined();
    }
  });
});
