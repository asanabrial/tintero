/**
 * TDD RED → GREEN tests for login error i18n fix.
 *
 * Spec:
 *  - The login server action must return a stable error CODE, not English prose.
 *  - The i18n catalog must contain real translations for the two error codes in
 *    all six supported locales.
 */

import { describe, expect, test, mock, beforeAll } from "bun:test";

// Mock server-only guard and Next.js server dependencies BEFORE loading the
// action module. Static imports are hoisted, so we use dynamic import below.
mock.module("server-only", () => ({}));
mock.module("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect called unexpectedly in test");
  },
}));
mock.module("@/lib/auth/session", () => ({
  createSession: async () => {},
  deleteSession: async () => {},
}));
mock.module("@/lib/auth/factory", () => ({
  getUserRepository: () => ({
    findByEmail: async () => null,
  }),
}));

import { t } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Part 1 — server action returns a stable code, not English prose
// ---------------------------------------------------------------------------

describe("login action — error codes", () => {
  let login: Awaited<typeof import("@/app/admin/login/actions")>["login"];

  beforeAll(async () => {
    // Dynamic import so mock.module runs first.
    const actions = await import("@/app/admin/login/actions");
    login = actions.login;
  });

  test("invalid-format email returns 'invalidCredentials' code (not English prose)", async () => {
    const formData = new FormData();
    formData.set("email", "notanemail");
    formData.set("password", "");

    const result = await login(undefined, formData);

    // Must be the stable code, not the old English prose
    expect(result.error).toBe("invalidCredentials");
    expect(result.error).not.toContain(" ");
    expect(result.error).not.toBe("Invalid email or password.");
  });
});

// ---------------------------------------------------------------------------
// Part 2 — i18n catalog has real translations in all 6 locales
// ---------------------------------------------------------------------------

const LOCALES = ["en", "es", "fr", "de", "pt", "it"] as const;

describe("admin.login.errors — catalog completeness", () => {
  for (const locale of LOCALES) {
    test(`${locale}: invalidCredentials resolves to a non-empty, non-key string`, () => {
      const value = t(locale, "admin.login.errors.invalidCredentials");
      expect(value).not.toBe("admin.login.errors.invalidCredentials");
      expect(value.length).toBeGreaterThan(0);
    });

    test(`${locale}: notSetUp resolves to a non-empty, non-key string`, () => {
      const value = t(locale, "admin.login.errors.notSetUp");
      expect(value).not.toBe("admin.login.errors.notSetUp");
      expect(value.length).toBeGreaterThan(0);
    });
  }

  test("non-English locales have DIFFERENT invalidCredentials text from English (real translations, not fallback)", () => {
    const en = t("en", "admin.login.errors.invalidCredentials");
    for (const locale of ["es", "fr", "de", "pt", "it"] as const) {
      const value = t(locale, "admin.login.errors.invalidCredentials");
      expect(value).not.toBe(en);
    }
  });

  test("non-English locales have DIFFERENT notSetUp text from English (real translations, not fallback)", () => {
    const en = t("en", "admin.login.errors.notSetUp");
    for (const locale of ["es", "fr", "de", "pt", "it"] as const) {
      const value = t(locale, "admin.login.errors.notSetUp");
      expect(value).not.toBe(en);
    }
  });
});
