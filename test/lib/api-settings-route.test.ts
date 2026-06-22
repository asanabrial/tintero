// Route handler tests for /api/v1/settings — env-free paths only.
// GET is public (no auth) and file-based (no DATABASE_URL needed).
// PUT requires auth; tests cover 401, 400 validation, and invalid JSON.
//
// Auth mock pattern: set API_TOKEN env var + Authorization: Bearer <token> header.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { handleSettingsGet, PUT as settingsPUT } from "../../src/app/api/v1/settings/route";
import { toSiteConfigJson } from "../../src/lib/api/serialize";

// ============================================================
// Env save/restore
// ============================================================

const TEST_TOKEN = "test-api-token-for-settings";

let savedDbUrl: string | undefined;
let savedApiToken: string | undefined;

beforeEach(() => {
  savedDbUrl = process.env.DATABASE_URL;
  savedApiToken = process.env.API_TOKEN;
  delete process.env.DATABASE_URL;
  delete process.env.API_TOKEN;
});

afterEach(() => {
  if (savedDbUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = savedDbUrl;
  }
  if (savedApiToken === undefined) {
    delete process.env.API_TOKEN;
  } else {
    process.env.API_TOKEN = savedApiToken;
  }
});

// ============================================================
// Helpers
// ============================================================

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, options);
}

function makeAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${TEST_TOKEN}` };
}

// ============================================================
// GET /api/v1/settings — public, file-based (REQ-6)
// ============================================================

describe("GET /api/v1/settings — public access", () => {
  test("returns 200 without auth and without DATABASE_URL", async () => {
    const res = await handleSettingsGet();
    expect(res.status).toBe(200);
  });

  test("response body has required SiteConfigJson shape", async () => {
    const res = await handleSettingsGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.title).toBe("string");
    expect(typeof body.description).toBe("string");
    expect(typeof body.baseUrl).toBe("string");
    expect(typeof body.language).toBe("string");
    expect(typeof body.author).toBe("object");
    expect(typeof body.author.name).toBe("string");
    expect(Array.isArray(body.nav)).toBe(true);
    expect(typeof body.reading).toBe("object");
    expect(typeof body.reading.homepage).toBe("string");
    expect(typeof body.reading.posts_per_page).toBe("number");
    expect(typeof body.comments).toBe("object");
    expect(typeof body.comments.enabled).toBe("boolean");
    expect(typeof body.comments.moderation).toBe("string");
  });

  test("response body does NOT contain passwordHash or secret keys", async () => {
    const res = await handleSettingsGet();
    const raw = await res.text();
    expect(raw.includes("passwordHash")).toBe(false);
    expect(raw.includes("secret")).toBe(false);
  });
});

// ============================================================
// toSiteConfigJson — whitelist serializer (REQ-9, R9.3)
// ============================================================

describe("toSiteConfigJson — whitelist shape", () => {
  test("explicit field whitelist contains title, description, baseUrl, language, author, nav, reading, comments", () => {
    const config = {
      title: "Test Site",
      description: "Desc",
      baseUrl: "https://test.com",
      language: "en",
      author: { name: "Author", email: "a@b.com" },
      nav: [{ label: "Home", href: "/" }],
      footerNav: [],
      reading: { homepage: "hero-recent" as const, posts_per_page: 10 },
      comments: { enabled: true, moderation: "manual" as const },
    };
    const result = toSiteConfigJson(config);
    expect(result.title).toBe("Test Site");
    expect(result.description).toBe("Desc");
    expect(result.baseUrl).toBe("https://test.com");
    expect(result.language).toBe("en");
    expect(result.author.name).toBe("Author");
    expect(result.author.email).toBe("a@b.com");
    expect(Array.isArray(result.nav)).toBe(true);
    expect(result.nav[0].label).toBe("Home");
    expect(result.reading.homepage).toBe("hero-recent");
    expect(result.reading.posts_per_page).toBe(10);
    expect(result.comments.enabled).toBe(true);
    expect(result.comments.moderation).toBe("manual");
  });

  test("optional author.email is omitted when undefined", () => {
    const config = {
      title: "T",
      description: "",
      baseUrl: "https://t.com",
      language: "en",
      author: { name: "A" },
      nav: [],
      footerNav: [],
      reading: { homepage: "hero-recent" as const, posts_per_page: 5 },
      comments: { enabled: false, moderation: "manual" as const },
    };
    const result = toSiteConfigJson(config);
    expect("email" in result.author).toBe(false);
  });

  test("optional social field included only when present", () => {
    const configWithSocial = {
      title: "T",
      description: "",
      baseUrl: "https://t.com",
      language: "en",
      author: { name: "A" },
      nav: [],
      footerNav: [],
      social: { twitter: "x" },
      reading: { homepage: "hero-recent" as const, posts_per_page: 5 },
      comments: { enabled: false, moderation: "manual" as const },
    };
    const withSocial = toSiteConfigJson(configWithSocial);
    expect(withSocial.social).toEqual({ twitter: "x" });

    const configWithoutSocial = {
      title: "T",
      description: "",
      baseUrl: "https://t.com",
      language: "en",
      author: { name: "A" },
      nav: [],
      footerNav: [],
      reading: { homepage: "hero-recent" as const, posts_per_page: 5 },
      comments: { enabled: false, moderation: "manual" as const },
    };
    const withoutSocial = toSiteConfigJson(configWithoutSocial);
    expect("social" in withoutSocial).toBe(false);
  });

  test("does NOT spread unknown keys from config", () => {
    const configWithExtra = {
      title: "T",
      description: "",
      baseUrl: "https://t.com",
      language: "en",
      author: { name: "A" },
      nav: [],
      footerNav: [],
      reading: { homepage: "hero-recent" as const, posts_per_page: 5 },
      comments: { enabled: false, moderation: "manual" as const },
      _internalSecret: "leaked",
    };
    const result = toSiteConfigJson(configWithExtra as Parameters<typeof toSiteConfigJson>[0]);
    expect("_internalSecret" in result).toBe(false);
    expect(JSON.stringify(result).includes("leaked")).toBe(false);
  });
});

// ============================================================
// PUT /api/v1/settings — auth guard
// ============================================================

describe("PUT /api/v1/settings — auth guard", () => {
  test("no auth → 401", async () => {
    const req = makeRequest("http://t/api/v1/settings", { method: "PUT" });
    const res = await settingsPUT(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("invalid token → 401", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/settings", {
      method: "PUT",
      headers: { Authorization: "Bearer wrong-token" },
    });
    const res = await settingsPUT(req);
    expect(res.status).toBe(401);
  });
});

// ============================================================
// PUT /api/v1/settings — validation
// ============================================================

describe("PUT /api/v1/settings — validation", () => {
  test("invalid JSON → 400", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/settings", {
      method: "PUT",
      body: "not-json",
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await settingsPUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("missing title → 400 with fieldErrors.title", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/settings", {
      method: "PUT",
      body: JSON.stringify({
        description: "desc",
        baseUrl: "https://example.com",
        language: "en",
        author: { name: "Author" },
        reading: { homepage: "hero-recent", posts_per_page: 10 },
        comments: { enabled: true, moderation: "manual" },
      }),
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await settingsPUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors.title).toBeDefined();
  });

  test("bad baseUrl → 400 with fieldErrors.baseUrl", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/settings", {
      method: "PUT",
      body: JSON.stringify({
        title: "My Site",
        description: "desc",
        baseUrl: "not-a-url",
        language: "en",
        author: { name: "Author" },
        reading: { homepage: "hero-recent", posts_per_page: 10 },
        comments: { enabled: true, moderation: "manual" },
      }),
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await settingsPUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors.baseUrl).toBeDefined();
  });

  test("posts_per_page out of range → 400 with fieldErrors", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/settings", {
      method: "PUT",
      body: JSON.stringify({
        title: "My Site",
        description: "",
        baseUrl: "https://example.com",
        language: "en",
        author: { name: "Author" },
        reading: { homepage: "hero-recent", posts_per_page: 0 },
        comments: { enabled: true, moderation: "manual" },
      }),
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await settingsPUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors["reading.posts_per_page"]).toBeDefined();
  });
});
