// Route handler tests for /api/v1/users — env-free paths only (ADR-D6 / R1 lesson).
// Tests cover: auth-401, validation-400, db-down-503, passwordHash-absence.
// Happy-path DB tests (create, delete, password-update) require DATABASE_URL + a live
// pg pool and are NOT exercised here — same accepted gap as comments (factory.ts
// hardwires pg.Pool; no PGlite seam available).
//
// Auth mock pattern: set API_TOKEN env var + Authorization: Bearer <token> header.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { handleUsersGet, handleUsersPost } from "../../src/app/api/v1/users/route";
import { DELETE as deleteUser } from "../../src/app/api/v1/users/[id]/route";
import { POST as changePassword } from "../../src/app/api/v1/users/[id]/password/route";
import { toUserJson } from "../../src/lib/api/serialize";
import type { PublicUser } from "../../src/lib/auth/types";

// ============================================================
// Env save/restore
// ============================================================

const TEST_TOKEN = "test-api-token-for-users";

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

function makeIdCtx(id = "test-uuid-1234"): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ============================================================
// GET /api/v1/users — auth guard
// ============================================================

describe("GET /api/v1/users — auth guard", () => {
  test("no auth header → 401", async () => {
    const req = makeRequest("http://t/api/v1/users");
    const res = await handleUsersGet(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("invalid token → 401", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    const res = await handleUsersGet(req);
    expect(res.status).toBe(401);
  });
});

// ============================================================
// GET /api/v1/users — DB down
// ============================================================

describe("GET /api/v1/users — DB unavailable", () => {
  test("valid auth + DATABASE_URL unset → 503", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users", {
      headers: makeAuthHeaders(),
    });
    const res = await handleUsersGet(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// POST /api/v1/users — auth guard
// ============================================================

describe("POST /api/v1/users — auth guard", () => {
  test("no auth header → 401", async () => {
    const req = makeRequest("http://t/api/v1/users", { method: "POST" });
    const res = await handleUsersPost(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// POST /api/v1/users — validation
// ============================================================

describe("POST /api/v1/users — validation", () => {
  test("invalid JSON body → 400", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users", {
      method: "POST",
      body: "not-json",
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await handleUsersPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("bad email → 400 with fieldErrors", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", password: "secret" }),
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await handleUsersPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors.email).toBeDefined();
  });

  test("empty password → 400 with fieldErrors", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "" }),
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await handleUsersPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors.password).toBeDefined();
  });
});

// ============================================================
// POST /api/v1/users — DB down
// ============================================================

describe("POST /api/v1/users — DB unavailable", () => {
  test("valid auth + valid body + DATABASE_URL unset → 503", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", password: "secret123" }),
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await handleUsersPost(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// DELETE /api/v1/users/[id] — auth guard
// ============================================================

describe("DELETE /api/v1/users/[id] — auth guard", () => {
  test("no auth → 401", async () => {
    const req = makeRequest("http://t/api/v1/users/test-uuid", { method: "DELETE" });
    const res = await deleteUser(req, makeIdCtx());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// DELETE /api/v1/users/[id] — DB down
// ============================================================

describe("DELETE /api/v1/users/[id] — DB unavailable", () => {
  test("valid auth + DATABASE_URL unset → 503", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users/test-uuid", {
      method: "DELETE",
      headers: makeAuthHeaders(),
    });
    const res = await deleteUser(req, makeIdCtx());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// POST /api/v1/users/[id]/password — auth guard
// ============================================================

describe("POST /api/v1/users/[id]/password — auth guard", () => {
  test("no auth → 401", async () => {
    const req = makeRequest("http://t/api/v1/users/test-uuid/password", {
      method: "POST",
    });
    const res = await changePassword(req, makeIdCtx());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// POST /api/v1/users/[id]/password — validation
// ============================================================

describe("POST /api/v1/users/[id]/password — validation", () => {
  test("invalid JSON → 400", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users/test-uuid/password", {
      method: "POST",
      body: "not-json",
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await changePassword(req, makeIdCtx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test("empty password → 400 with fieldErrors", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users/test-uuid/password", {
      method: "POST",
      body: JSON.stringify({ password: "" }),
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await changePassword(req, makeIdCtx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors.password).toBeDefined();
  });
});

// ============================================================
// POST /api/v1/users/[id]/password — DB down
// ============================================================

describe("POST /api/v1/users/[id]/password — DB unavailable", () => {
  test("valid auth + valid body + DATABASE_URL unset → 503", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest("http://t/api/v1/users/test-uuid/password", {
      method: "POST",
      body: JSON.stringify({ password: "newpassword" }),
      headers: { ...makeAuthHeaders(), "Content-Type": "application/json" },
    });
    const res = await changePassword(req, makeIdCtx());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ============================================================
// SECURITY: toUserJson — passwordHash NEVER in output (REQ-5, R5.1, R5.3)
// ============================================================

describe("SECURITY: toUserJson — passwordHash absence", () => {
  test("toUserJson with PublicUser has no passwordHash key", () => {
    const user: PublicUser = {
      id: "u-1",
      email: "admin@example.com",
      role: "admin",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      name: null,
      bio: null,
    };
    const result = toUserJson(user);
    expect("passwordHash" in result).toBe(false);
    expect(JSON.stringify(result).includes("passwordHash")).toBe(false);
  });

  test("toUserJson with a user object that has extra fields does not leak them", () => {
    // Simulate a User (with passwordHash) being accidentally cast to PublicUser
    const userWithHash = {
      id: "u-2",
      email: "admin2@example.com",
      role: "admin" as const,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      name: null,
      bio: null,
      passwordHash: "bcrypt$secret$hash",
    };
    // Even if someone passes an object with passwordHash, toUserJson must not include it
    const result = toUserJson(userWithHash as PublicUser);
    expect("passwordHash" in result).toBe(false);
    expect(JSON.stringify(result).includes("passwordHash")).toBe(false);
  });
});
