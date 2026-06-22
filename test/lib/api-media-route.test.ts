// Route handler tests for /api/v1/media — env-free paths only (mirrors api-users-route.test.ts).
// Tests cover: GET auth-401, DELETE auth-401, DELETE traversal-400, DELETE missing-404.
// Happy-path GET (real files) and DELETE (real files) require process.cwd()/uploads
// and are NOT exercised here — same accepted gap as users route.
//
// Auth mock pattern: set API_TOKEN env var + Authorization: Bearer <token> header.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { handleMediaGet } from "../../src/app/api/v1/media/route";
import { DELETE as deleteMedia } from "../../src/app/api/v1/media/[filename]/route";

// ============================================================
// Env save/restore
// ============================================================

const TEST_TOKEN = "test-api-token-for-media";

let savedApiToken: string | undefined;

beforeEach(() => {
  savedApiToken = process.env.API_TOKEN;
  delete process.env.API_TOKEN;
});

afterEach(() => {
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

function makeFilenameCtx(filename: string): { params: Promise<{ filename: string }> } {
  return { params: Promise.resolve({ filename }) };
}

// ============================================================
// GET /api/v1/media — auth guard
// ============================================================

describe("GET /api/v1/media — auth guard", () => {
  test("no auth header -> 401", async () => {
    const req = makeRequest("http://t/api/v1/media");
    const res = await handleMediaGet(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("invalid token -> 401", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/media", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    const res = await handleMediaGet(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// DELETE /api/v1/media/[filename] — auth guard
// ============================================================

describe("DELETE /api/v1/media/[filename] — auth guard", () => {
  test("no auth -> 401", async () => {
    const req = makeRequest("http://t/api/v1/media/photo.jpg", { method: "DELETE" });
    const res = await deleteMedia(req, makeFilenameCtx("photo.jpg"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// DELETE /api/v1/media/[filename] — traversal guard
// ============================================================

describe("DELETE /api/v1/media/[filename] — traversal guard", () => {
  test("auth + traversal filename -> 400", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/media/..%2Fx.png", {
      method: "DELETE",
      headers: makeAuthHeaders(),
    });
    const res = await deleteMedia(req, makeFilenameCtx("../x.png"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// DELETE /api/v1/media/[filename] — 404 for missing file
// ============================================================

describe("DELETE /api/v1/media/[filename] — not found", () => {
  test("auth + non-existent filename -> 404", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/media/ghost-does-not-exist-uuid.jpg", {
      method: "DELETE",
      headers: makeAuthHeaders(),
    });
    const res = await deleteMedia(req, makeFilenameCtx("ghost-does-not-exist-uuid.jpg"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
