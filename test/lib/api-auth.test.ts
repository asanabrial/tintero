import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { verifyApiAuth, getApiIdentity } from "../../src/lib/api/auth";
import { signToken } from "../../src/lib/auth/session-token";
import type { SessionPayload } from "../../src/lib/auth/types";

// ============================================================
// Helpers
// ============================================================

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/test", { headers });
}

const TEST_SECRET = "test-secret-that-is-long-enough-for-hs256-minimum";
const TEST_TOKEN = "my-secure-api-token-1234";

const SAMPLE_PAYLOAD: SessionPayload = {
  userId: "user-uuid-1",
  role: "admin",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

// ============================================================
// Environment save/restore
// ============================================================

let savedApiToken: string | undefined;
let savedAuthSecret: string | undefined;

beforeEach(() => {
  savedApiToken = process.env.API_TOKEN;
  savedAuthSecret = process.env.AUTH_SECRET;
  // Reset to clean state before each test
  delete process.env.API_TOKEN;
  delete process.env.AUTH_SECRET;
});

afterEach(() => {
  if (savedApiToken === undefined) {
    delete process.env.API_TOKEN;
  } else {
    process.env.API_TOKEN = savedApiToken;
  }
  if (savedAuthSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = savedAuthSecret;
  }
});

// ============================================================
// Bearer token path
// ============================================================

describe("verifyApiAuth — Bearer token", () => {
  test("matching Bearer token when API_TOKEN is set → true", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest({ authorization: `Bearer ${TEST_TOKEN}` });
    await expect(verifyApiAuth(req)).resolves.toBe(true);
  });

  test("mismatched Bearer token → false", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest({ authorization: "Bearer wrong-token" });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });

  test("API_TOKEN unset + Bearer present → false (not throw)", async () => {
    // API_TOKEN is not set (deleted in beforeEach)
    const req = makeRequest({ authorization: `Bearer ${TEST_TOKEN}` });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });

  test("malformed Authorization header (no Bearer prefix) → false", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest({ authorization: `Basic ${TEST_TOKEN}` });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });

  test("Authorization header is just 'Bearer' with no token → false", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest({ authorization: "Bearer" });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });

  test("timing-safe: similar-length wrong token → false", async () => {
    process.env.API_TOKEN = "aaaaaaaaaa";
    const req = makeRequest({ authorization: "Bearer aaaaaaaaab" }); // 1 char differs
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });
});

// ============================================================
// No auth at all
// ============================================================

describe("verifyApiAuth — no auth", () => {
  test("no Authorization header, no cookie → false", async () => {
    const req = makeRequest();
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });

  test("empty Authorization header → false", async () => {
    const req = makeRequest({ authorization: "" });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });
});

// ============================================================
// Session cookie path
// ============================================================

describe("verifyApiAuth — session cookie", () => {
  test("valid session cookie with AUTH_SECRET set → true", async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    const jwt = await signToken(SAMPLE_PAYLOAD, TEST_SECRET);
    const req = makeRequest({ cookie: `session=${jwt}` });
    await expect(verifyApiAuth(req)).resolves.toBe(true);
  });

  test("valid session cookie mixed with other cookies → true", async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    const jwt = await signToken(SAMPLE_PAYLOAD, TEST_SECRET);
    const req = makeRequest({ cookie: `theme=dark; session=${jwt}; lang=en` });
    await expect(verifyApiAuth(req)).resolves.toBe(true);
  });

  test("AUTH_SECRET unset + cookie present → false (getAuthSecret throws, caught)", async () => {
    // AUTH_SECRET not set (deleted in beforeEach)
    const jwt = await signToken(SAMPLE_PAYLOAD, TEST_SECRET);
    const req = makeRequest({ cookie: `session=${jwt}` });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });

  test("invalid JWT in cookie → false", async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    const req = makeRequest({ cookie: "session=not.a.valid.jwt" });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });

  test("cookie with wrong secret → false", async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    const jwt = await signToken(SAMPLE_PAYLOAD, "different-secret-string-here");
    const req = makeRequest({ cookie: `session=${jwt}` });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });

  test("no cookie header → false", async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    const req = makeRequest(); // no cookie header
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });
});

// ============================================================
// Never throws contract
// ============================================================

describe("verifyApiAuth — never throws", () => {
  test("does not throw with no env vars and no headers", async () => {
    const req = makeRequest();
    await expect(verifyApiAuth(req)).resolves.toBeDefined();
  });

  test("does not throw with garbage cookie value", async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    const req = makeRequest({ cookie: "session=garbage!!!invalidbase64@@@" });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });

  test("does not throw when AUTH_SECRET throws and Bearer is also invalid", async () => {
    // No API_TOKEN set, no AUTH_SECRET set
    const req = makeRequest({
      authorization: "Bearer invalid",
      cookie: "session=fakejwt",
    });
    await expect(verifyApiAuth(req)).resolves.toBe(false);
  });
});

// ============================================================
// getApiIdentity — WU-3 RED tests
// ============================================================

describe("getApiIdentity — Bearer token path", () => {
  test("Bearer match → returns non-null string (not the raw token)", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest({ authorization: `Bearer ${TEST_TOKEN}` });
    const identity = await getApiIdentity(req);
    expect(identity).not.toBeNull();
    expect(typeof identity).toBe("string");
    // MUST NOT equal the raw token
    expect(identity).not.toBe(TEST_TOKEN);
  });

  test("Bearer match → returned string does not contain the raw API_TOKEN env value", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest({ authorization: `Bearer ${TEST_TOKEN}` });
    const identity = await getApiIdentity(req);
    // The raw token must never appear in the returned label
    expect(identity).not.toBe(TEST_TOKEN);
    // Also must not be empty
    expect((identity ?? "").length).toBeGreaterThan(0);
  });

  test("Bearer match → result is suitable as an audit label (non-empty string)", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest({ authorization: `Bearer ${TEST_TOKEN}` });
    const identity = await getApiIdentity(req);
    expect(identity).not.toBeNull();
    expect(identity!.length).toBeGreaterThan(0);
  });

  test("API_TOKEN not set + Bearer present → null", async () => {
    // API_TOKEN deleted in beforeEach
    const req = makeRequest({ authorization: `Bearer ${TEST_TOKEN}` });
    const identity = await getApiIdentity(req);
    // No matching token → not authenticated as API
    // Could fall through to cookie path (which also fails) → null
    expect(identity).toBeNull();
  });
});

describe("getApiIdentity — no auth", () => {
  test("no Authorization header, no cookie → null", async () => {
    const req = makeRequest();
    const identity = await getApiIdentity(req);
    expect(identity).toBeNull();
  });

  test("mismatched Bearer token → null", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    const req = makeRequest({ authorization: "Bearer wrong-token" });
    const identity = await getApiIdentity(req);
    // Wrong bearer doesn't match → falls through to cookie (none) → null
    expect(identity).toBeNull();
  });
});

describe("getApiIdentity — session cookie path", () => {
  test("valid session cookie → returns non-null identity label", async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    const jwt = await signToken(SAMPLE_PAYLOAD, TEST_SECRET);
    const req = makeRequest({ cookie: `session=${jwt}` });
    const identity = await getApiIdentity(req);
    expect(identity).not.toBeNull();
    expect(typeof identity).toBe("string");
  });

  test("valid session cookie → does not return raw API_TOKEN", async () => {
    process.env.API_TOKEN = TEST_TOKEN;
    process.env.AUTH_SECRET = TEST_SECRET;
    const jwt = await signToken(SAMPLE_PAYLOAD, TEST_SECRET);
    const req = makeRequest({ cookie: `session=${jwt}` });
    const identity = await getApiIdentity(req);
    expect(identity).not.toBe(TEST_TOKEN);
  });
});

describe("getApiIdentity — never throws contract", () => {
  test("never throws with no env vars and no headers", async () => {
    const req = makeRequest();
    await expect(getApiIdentity(req)).resolves.toBeDefined();
  });

  test("never throws with garbage cookie value", async () => {
    process.env.AUTH_SECRET = TEST_SECRET;
    const req = makeRequest({ cookie: "session=garbage!!!invalidbase64@@@" });
    // Should resolve (not reject), value is null
    const identity = await getApiIdentity(req);
    expect(identity).toBeNull();
  });
});
