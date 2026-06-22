// Route handler tests for /api/v1/comments — env-free paths only (ADR-D6).
// Tests cover: auth-401, db-down-503, zod-400, missing-postSlug-400.
// Happy-path DB tests require DATABASE_URL and are covered transitively by adapter tests.
//
// Auth mock pattern: set Authorization: Bearer <token> + API_TOKEN=<token> env var.
// Mirrors pattern from test/lib/api-auth.test.ts.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { handleCommentsGet as commentsGET, POST as commentsPOST } from "../../src/app/api/v1/comments/route";
import { POST as approveRoute } from "../../src/app/api/v1/comments/[id]/approve/route";
import { POST as spamRoute } from "../../src/app/api/v1/comments/[id]/spam/route";
import { DELETE as deleteRoute } from "../../src/app/api/v1/comments/[id]/route";
import { toCommentJson } from "../../src/lib/api/serialize";
import type { Comment } from "../../src/lib/comments/types";

// ============================================================
// Env save/restore
// ============================================================

const TEST_TOKEN = "test-api-token-for-comments";

let savedDbUrl: string | undefined;
let savedApiToken: string | undefined;

beforeEach(() => {
  savedDbUrl = process.env.DATABASE_URL;
  savedApiToken = process.env.API_TOKEN;
  // Start each test with no DB and no auth token
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

// Ctx for dynamic routes
function makeIdCtx(id = "test-uuid-1234"): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ============================================================
// GET /api/v1/comments — no postSlug → 400
// ============================================================

describe("GET /api/v1/comments — missing postSlug", () => {
  test("no postSlug, no status → 400 with error", async () => {
    const req = makeRequest("http://t/api/v1/comments");
    const res = await commentsGET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// GET /api/v1/comments?status=pending — auth gate
// ============================================================

describe("GET /api/v1/comments?status=pending — auth guard", () => {
  test("no auth → 401", async () => {
    const req = makeRequest("http://t/api/v1/comments?status=pending");
    const res = await commentsGET(req);
    expect(res.status).toBe(401);
  });

  test("with valid auth + DATABASE_URL unset → 503", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/comments?status=pending", {
      headers: makeAuthHeaders(),
    });
    const res = await commentsGET(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// GET /api/v1/comments?postSlug=x — DB down → 503
// ============================================================

describe("GET /api/v1/comments?postSlug=x — DB down", () => {
  test("valid postSlug but DATABASE_URL unset → 503", async () => {
    const req = makeRequest("http://t/api/v1/comments?postSlug=some-post");
    const res = await commentsGET(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// POST /api/v1/comments — validation paths
// ============================================================

describe("POST /api/v1/comments — validation", () => {
  test("invalid JSON → 400", async () => {
    const req = makeRequest("http://t/api/v1/comments", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await commentsPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("missing required 'body' field → 400 with issues", async () => {
    const req = makeRequest("http://t/api/v1/comments", {
      method: "POST",
      body: JSON.stringify({ postSlug: "my-post", authorName: "Alice" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await commentsPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(Array.isArray(json.issues)).toBe(true);
  });

  test("missing required 'postSlug' field → 400 with issues", async () => {
    const req = makeRequest("http://t/api/v1/comments", {
      method: "POST",
      body: JSON.stringify({ authorName: "Alice", body: "Nice post!" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await commentsPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(Array.isArray(json.issues)).toBe(true);
  });

  test("valid body but DATABASE_URL unset → 503", async () => {
    const req = makeRequest("http://t/api/v1/comments", {
      method: "POST",
      body: JSON.stringify({ postSlug: "my-post", authorName: "Alice", body: "Nice post!" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await commentsPOST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// POST /api/v1/comments/[id]/approve — auth + DB-down
// ============================================================

describe("POST /api/v1/comments/[id]/approve", () => {
  test("no auth → 401", async () => {
    const req = makeRequest("http://t/api/v1/comments/test-uuid/approve", { method: "POST" });
    const res = await approveRoute(req, makeIdCtx());
    expect(res.status).toBe(401);
  });

  test("with valid auth + DATABASE_URL unset → 503", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/comments/test-uuid/approve", {
      method: "POST",
      headers: makeAuthHeaders(),
    });
    const res = await approveRoute(req, makeIdCtx());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// POST /api/v1/comments/[id]/spam — auth + DB-down
// ============================================================

describe("POST /api/v1/comments/[id]/spam", () => {
  test("no auth → 401", async () => {
    const req = makeRequest("http://t/api/v1/comments/test-uuid/spam", { method: "POST" });
    const res = await spamRoute(req, makeIdCtx());
    expect(res.status).toBe(401);
  });

  test("with valid auth + DATABASE_URL unset → 503", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/comments/test-uuid/spam", {
      method: "POST",
      headers: makeAuthHeaders(),
    });
    const res = await spamRoute(req, makeIdCtx());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// DELETE /api/v1/comments/[id] — auth + DB-down
// ============================================================

describe("DELETE /api/v1/comments/[id]", () => {
  test("no auth → 401", async () => {
    const req = makeRequest("http://t/api/v1/comments/test-uuid", { method: "DELETE" });
    const res = await deleteRoute(req, makeIdCtx());
    expect(res.status).toBe(401);
  });

  test("with valid auth + DATABASE_URL unset → 503", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/comments/test-uuid", {
      method: "DELETE",
      headers: makeAuthHeaders(),
    });
    const res = await deleteRoute(req, makeIdCtx());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// SECURITY: authorEmail NEVER in comment response — 4.1
// ============================================================

describe("SECURITY: toCommentJson — authorEmail absence", () => {
  test("toCommentJson with a Comment that has authorEmail produces no authorEmail in output", () => {
    // This test imports the serializer directly — route-level coverage is transitive.
    // Mirrors spec Domain 1 authorEmail prohibition.
    const comment: Comment = {
      id: "aaa-bbb",
      postSlug: "test",
      authorName: "Alice",
      authorEmail: "alice@secret.com",
      authorUrl: null,
      body: "Hello",
      status: "pending",
      parentId: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
    };
    const result = toCommentJson(comment);
    expect(JSON.stringify(result).includes("authorEmail")).toBe(false);
    expect("authorEmail" in result).toBe(false);
  });
});
