/**
 * TDD RED → GREEN tests for the public password-unlock error i18n fix.
 *
 * Spec (mirrors the login-error-i18n fix):
 *  - unlockPostAction must return a stable error CODE, not English prose.
 *  - The i18n catalog must contain real translations for both codes in all six
 *    supported locales.
 */

import { describe, expect, test, mock, beforeAll } from "bun:test";

// Mock server/Next deps BEFORE loading the action module (dynamic import below).
mock.module("server-only", () => ({}));
mock.module("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect called unexpectedly in test");
  },
}));
mock.module("next/headers", () => ({
  cookies: async () => ({ set: () => {} }),
}));

// Configurable post returned by the mocked repository.
let mockPost: unknown = null;
mock.module("@/lib/content", () => ({
  getRepository: () => ({
    getPost: async () => mockPost,
  }),
}));

import { t } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Part 1 — server action returns a stable code, not English prose
// ---------------------------------------------------------------------------

describe("unlockPostAction — error codes", () => {
  let unlockPostAction: Awaited<
    typeof import("@/app/(site)/blog/[...slug]/actions")
  >["unlockPostAction"];

  beforeAll(async () => {
    const actions = await import("@/app/(site)/blog/[...slug]/actions");
    unlockPostAction = actions.unlockPostAction;
  });

  test("missing slug returns 'invalidRequest' code (not English prose)", async () => {
    const formData = new FormData();
    formData.set("password", "whatever");

    const result = await unlockPostAction(undefined, formData);

    expect(result?.error).toBe("invalidRequest");
    expect(result?.error).not.toContain(" ");
    expect(result?.error).not.toBe("Invalid request.");
  });

  test("non-password-protected post returns 'invalidRequest' code", async () => {
    mockPost = { slug: "x", visibility: "public", password: null };
    const formData = new FormData();
    formData.set("slug", "x");
    formData.set("password", "whatever");

    const result = await unlockPostAction(undefined, formData);

    expect(result?.error).toBe("invalidRequest");
  });

  test("wrong password returns 'incorrectPassword' code (not English prose)", async () => {
    mockPost = { slug: "secret-post", visibility: "password", password: "right" };
    const formData = new FormData();
    formData.set("slug", "secret-post");
    formData.set("password", "wrong");

    const result = await unlockPostAction(undefined, formData);

    expect(result?.error).toBe("incorrectPassword");
    expect(result?.error).not.toContain(" ");
    expect(result?.error).not.toBe("Incorrect password.");
  });
});

// ---------------------------------------------------------------------------
// Part 2 — i18n catalog has real translations in all 6 locales
// ---------------------------------------------------------------------------

const LOCALES = ["en", "es", "fr", "de", "pt", "it"] as const;
const CODES = ["invalidRequest", "incorrectPassword"] as const;

describe("common.passwordUnlock errors — catalog completeness", () => {
  for (const locale of LOCALES) {
    for (const code of CODES) {
      test(`${locale}: ${code} resolves to a non-empty, non-key string`, () => {
        const key = `common.passwordUnlock.${code}`;
        const value = t(locale, key);
        expect(value).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      });
    }
  }

  for (const code of CODES) {
    test(`non-English locales have DIFFERENT ${code} text from English (real translations)`, () => {
      const key = `common.passwordUnlock.${code}`;
      const en = t("en", key);
      for (const locale of ["es", "fr", "de", "pt", "it"] as const) {
        expect(t(locale, key)).not.toBe(en);
      }
    });
  }
});
