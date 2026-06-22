// Tests for validateSettingsFields — pure helper extracted from settings/actions.ts (ADR-7).
// Env-free; no FS access. Tests cover: valid input, invalid baseUrl, missing required fields,
// posts_per_page out of range, and static_page cross-field validation.

import { describe, expect, test } from "bun:test";
import { validateSettingsFields, mergeSiteConfig } from "../../src/lib/content/site-config-writer";

// ============================================================
// Fixtures
// ============================================================

function makeValidInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "My Blog",
    description: "A great blog",
    baseUrl: "https://example.com",
    language: "en",
    author: {
      name: "Jane Doe",
      email: "jane@example.com",
    },
    reading: {
      homepage: "hero-recent",
      posts_per_page: 10,
    },
    comments: {
      enabled: true,
      moderation: "manual",
    },
    ...overrides,
  };
}

// ============================================================
// Valid input
// ============================================================

describe("validateSettingsFields — valid input", () => {
  test("full valid input → ok:true with SettingsFields", () => {
    const result = validateSettingsFields(makeValidInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.title).toBe("My Blog");
      expect(result.fields.description).toBe("A great blog");
      expect(result.fields.baseUrl).toBe("https://example.com");
      expect(result.fields.language).toBe("en");
      expect(result.fields.author.name).toBe("Jane Doe");
      expect(result.fields.author.email).toBe("jane@example.com");
      expect(result.fields.reading.homepage).toBe("hero-recent");
      expect(result.fields.reading.posts_per_page).toBe(10);
      expect(result.fields.comments.enabled).toBe(true);
      expect(result.fields.comments.moderation).toBe("manual");
    }
  });

  test("optional author.email can be omitted → ok:true", () => {
    const input = makeValidInput();
    (input.author as Record<string, unknown>).email = undefined;
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
  });

  test("optional author.email can be empty string → ok:true (treated as absent)", () => {
    const input = makeValidInput();
    (input.author as Record<string, unknown>).email = "";
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
  });

  test("nav and social fields are ignored (not required)", () => {
    const input = makeValidInput({ nav: [{ label: "Home", href: "/" }], social: { twitter: "x" } });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
  });

  test("homepage=static-page with static_page set → ok:true", () => {
    const input = makeValidInput({
      reading: {
        homepage: "static-page",
        posts_per_page: 10,
        static_page: "about",
      },
    });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.reading.homepage).toBe("static-page");
      expect(result.fields.reading.static_page).toBe("about");
    }
  });

  test("posts_per_page boundary 1 → ok:true", () => {
    const input = makeValidInput({ reading: { homepage: "hero-recent", posts_per_page: 1 } });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
  });

  test("posts_per_page boundary 9999 → ok:true", () => {
    const input = makeValidInput({ reading: { homepage: "hero-recent", posts_per_page: 9999 } });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
  });
});

// ============================================================
// Invalid inputs — field errors
// ============================================================

describe("validateSettingsFields — invalid baseUrl", () => {
  test("non-URL string → ok:false with fieldErrors.baseUrl", () => {
    const input = makeValidInput({ baseUrl: "not-a-url" });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["baseUrl"]).toBeDefined();
      expect(result.fieldErrors["baseUrl"].length).toBeGreaterThan(0);
    }
  });

  test("empty baseUrl → ok:false with fieldErrors.baseUrl", () => {
    const input = makeValidInput({ baseUrl: "" });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["baseUrl"]).toBeDefined();
    }
  });
});

describe("validateSettingsFields — missing required title", () => {
  test("empty title → ok:false with fieldErrors.title", () => {
    const input = makeValidInput({ title: "" });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["title"]).toBeDefined();
    }
  });

  test("missing title key → ok:false with fieldErrors.title", () => {
    const input = makeValidInput();
    delete (input as Record<string, unknown>)["title"];
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["title"]).toBeDefined();
    }
  });
});

describe("validateSettingsFields — missing required language", () => {
  test("empty language → ok:false with fieldErrors.language", () => {
    const input = makeValidInput({ language: "" });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["language"]).toBeDefined();
    }
  });
});

describe("validateSettingsFields — missing required author.name", () => {
  test("empty author.name → ok:false with fieldErrors['author.name']", () => {
    const input = makeValidInput({ author: { name: "", email: "a@b.com" } });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["author.name"]).toBeDefined();
    }
  });
});

describe("validateSettingsFields — invalid author.email", () => {
  test("malformed author.email → ok:false with fieldErrors['author.email']", () => {
    const input = makeValidInput({ author: { name: "Jane", email: "not-an-email" } });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["author.email"]).toBeDefined();
    }
  });
});

describe("validateSettingsFields — invalid posts_per_page", () => {
  test("posts_per_page 0 → ok:false", () => {
    const input = makeValidInput({ reading: { homepage: "hero-recent", posts_per_page: 0 } });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["reading.posts_per_page"]).toBeDefined();
    }
  });

  test("posts_per_page 10000 → ok:false", () => {
    const input = makeValidInput({ reading: { homepage: "hero-recent", posts_per_page: 10000 } });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["reading.posts_per_page"]).toBeDefined();
    }
  });

  test("posts_per_page non-integer (1.5) → ok:false", () => {
    const input = makeValidInput({ reading: { homepage: "hero-recent", posts_per_page: 1.5 } });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["reading.posts_per_page"]).toBeDefined();
    }
  });

  test("posts_per_page missing → ok:false", () => {
    const input = makeValidInput({ reading: { homepage: "hero-recent" } });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["reading.posts_per_page"]).toBeDefined();
    }
  });
});

describe("validateSettingsFields — cross-field static_page", () => {
  test("homepage=static-page without static_page → ok:false", () => {
    const input = makeValidInput({
      reading: { homepage: "static-page", posts_per_page: 10 },
    });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["reading.static_page"]).toBeDefined();
    }
  });

  test("homepage=static-page with empty static_page → ok:false", () => {
    const input = makeValidInput({
      reading: { homepage: "static-page", posts_per_page: 10, static_page: "" },
    });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["reading.static_page"]).toBeDefined();
    }
  });

  test("homepage=hero-recent without static_page → ok:true (not required)", () => {
    const input = makeValidInput({
      reading: { homepage: "hero-recent", posts_per_page: 5 },
    });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
  });
});

describe("validateSettingsFields — non-object input", () => {
  test("null input → ok:false", () => {
    const result = validateSettingsFields(null);
    expect(result.ok).toBe(false);
  });

  test("string input → ok:false", () => {
    const result = validateSettingsFields("bad");
    expect(result.ok).toBe(false);
  });
});

// ============================================================
// Writing config — validateSettingsFields
// ============================================================

describe("validateSettingsFields — writing", () => {
  test("valid writing block → ok:true and fields.writing populated", () => {
    const input = makeValidInput({
      writing: { default_post_status: "published", default_post_category: "Tech" },
    });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.writing?.default_post_status).toBe("published");
      expect(result.fields.writing?.default_post_category).toBe("Tech");
    }
  });

  test("invalid status 'pending' → ok:false with fieldErrors['writing.default_post_status']", () => {
    const input = makeValidInput({
      writing: { default_post_status: "pending" },
    });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors["writing.default_post_status"]).toBeDefined();
      expect(result.fieldErrors["writing.default_post_status"].length).toBeGreaterThan(0);
    }
  });

  test("no writing block → ok:true and fields.writing.default_post_status === 'draft'", () => {
    // makeValidInput has no writing key — simulates existing configs
    const input = makeValidInput();
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.writing?.default_post_status).toBe("draft");
    }
  });

  test("empty category string → ok:true and fields.writing.default_post_category is undefined", () => {
    const input = makeValidInput({
      writing: { default_post_status: "draft", default_post_category: "" },
    });
    const result = validateSettingsFields(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fields.writing?.default_post_category).toBeUndefined();
    }
  });
});

// ============================================================
// Writing config — mergeSiteConfig
// ============================================================

describe("mergeSiteConfig — writing", () => {
  function makeRawObject(): Record<string, unknown> {
    return {
      title: "My Blog",
      description: "A test blog",
      baseUrl: "https://example.com",
      language: "en",
      author: { name: "Jane Doe" },
      nav: [{ label: "Home", href: "/" }],
      social: { twitter: "jane" },
      reading: { homepage: "hero-recent", posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" },
      theme: { colorPrimary: "#333333" },
    };
  }

  function makeBaseFields() {
    return {
      title: "My Blog",
      description: "A test blog",
      baseUrl: "https://example.com",
      language: "en",
      author: { name: "Jane Doe" },
      reading: { homepage: "hero-recent" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    };
  }

  test("writing keys updated; nav/social/theme/reading/comments preserved", () => {
    const rawObject = makeRawObject();
    const fields = {
      ...makeBaseFields(),
      writing: { default_post_status: "published" as const, default_post_category: "Tech" },
    };
    const merged = mergeSiteConfig(rawObject, fields);
    expect((merged.writing as Record<string, unknown>).default_post_status).toBe("published");
    expect((merged.writing as Record<string, unknown>).default_post_category).toBe("Tech");
    // Preserved keys
    expect(merged.nav).toEqual([{ label: "Home", href: "/" }]);
    expect(merged.social).toEqual({ twitter: "jane" });
    expect((merged.theme as Record<string, unknown>).colorPrimary).toBe("#333333");
  });

  test("empty/undefined category deletes the key from merged.writing", () => {
    const rawObject = {
      ...makeRawObject(),
      writing: { default_post_status: "draft", default_post_category: "OldCategory" },
    };
    const fields = {
      ...makeBaseFields(),
      writing: { default_post_status: "draft" as const, default_post_category: undefined },
    };
    const merged = mergeSiteConfig(rawObject, fields);
    expect((merged.writing as Record<string, unknown>).default_post_status).toBe("draft");
    expect((merged.writing as Record<string, unknown>).default_post_category).toBeUndefined();
    expect("default_post_category" in (merged.writing as Record<string, unknown>)).toBe(false);
  });
});
