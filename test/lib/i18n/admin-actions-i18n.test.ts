/**
 * TDD RED → GREEN tests for admin server-action error i18n.
 *
 * Spec:
 *  - Admin server actions must return a stable error CODE (a dotted i18n key),
 *    not English prose. The live site is Spanish; prose returned verbatim never
 *    gets translated at the display layer.
 *  - The i18n catalog must contain real, locale-distinct translations for every
 *    new admin error code in all six supported locales.
 *
 * Design note: each action returns the FULL dotted key (e.g.
 * "admin.errors.noPermission"). Many admin forms render BOTH shared codes
 * (admin.errors.noPermission) and area-specific codes from the same component,
 * so a single returned key the component renders via tr() is unambiguous —
 * unlike login, which only ever has one namespace and so can use a suffix.
 */

import { describe, expect, test, mock, beforeAll } from "bun:test";

import { t } from "@/lib/i18n";

const LOCALES = ["en", "es", "fr", "de", "pt", "it"] as const;

// Every new admin error key added by this change (full dotted paths).
const NEW_KEYS = [
  // shared
  "admin.errors.noPermission",
  "admin.errors.unknownIntent",
  "admin.errors.missingSlug",
  "admin.errors.labelRequired",
  "admin.errors.nameEmpty",
  // users
  "admin.errors.userEmailExists",
  "admin.errors.userCreateFailed",
  "admin.errors.userPasswordUpdateFailed",
  "admin.errors.userNotFound",
  "admin.errors.userCannotChangeOwnRole",
  "admin.errors.userCannotDemoteLastAdmin",
  "admin.errors.userRoleUpdateFailed",
  // tools
  "admin.errors.noFile",
  "admin.errors.fileTooLargeImport",
  "admin.errors.fileTooLargeWxr",
  // profile
  "admin.errors.profileAccountNotFound",
  "admin.errors.profileUpdateFailed",
  // comments
  "admin.errors.commentNotFound",
  "admin.errors.commentEditFailed",
  "admin.errors.commentReplyEmpty",
  "admin.errors.commentReplyTooLong",
  "admin.errors.commentReplyToApprovedOnly",
  "admin.errors.commentReplyFailed",
  // taxonomy
  "admin.errors.duplicateLabelCategory",
  "admin.errors.duplicateLabelTag",
  "admin.errors.createFailedCategory",
  "admin.errors.createFailedTag",
  "admin.errors.targetNotFoundCategory",
  "admin.errors.targetNotFoundTag",
  // posts
  "admin.errors.postOwnPostsOnly",
  "admin.errors.postTitleRequired",
  "admin.errors.postBodyRequired",
] as const;

// ---------------------------------------------------------------------------
// Part 1 — catalog completeness in all 6 locales
// ---------------------------------------------------------------------------

describe("admin.errors — catalog completeness", () => {
  for (const key of NEW_KEYS) {
    for (const locale of LOCALES) {
      test(`${locale}: ${key} resolves to a non-empty, non-key string`, () => {
        const value = t(locale, key);
        expect(value).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      });
    }

    test(`${key}: non-English locales differ from English (real translations)`, () => {
      const en = t("en", key);
      for (const locale of ["es", "fr", "de", "pt", "it"] as const) {
        expect(t(locale, key)).not.toBe(en);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Part 2 — representative actions return a stable CODE, not English prose
// ---------------------------------------------------------------------------

// Mock only the auth boundary. verifySession returns an UNPRIVILEGED role
// ("viewer" is absent from the capability map), so the REAL can() fails closed
// and every guarded action returns its permission code without us touching the
// capabilities module. All other module-load dependencies load their real
// implementations — the permission branch returns before any are used.
//
// Why this matters: bun's mock.module is process-global and does NOT auto-reset
// between test files. Mocking a shared module (e.g. capabilities) with a partial
// shape would leak missing exports / fake behavior into later files and break
// them. We therefore mock only `server-only` (no meaningful exports) and
// `@/lib/auth/dal` (verifySession is its sole export, imported by no other test).
mock.module("server-only", () => ({}));
mock.module("@/lib/auth/dal", () => ({
  verifySession: async () => ({ userId: "u1", role: "viewer" }),
}));

const CODE = /^admin\.errors\.[A-Za-z]+$/;

describe("admin actions — return codes, not prose", () => {
  let createUserAction: Awaited<
    typeof import("@/app/admin/(dashboard)/users/actions")
  >["createUserAction"];
  let updateWidgetsAction: Awaited<
    typeof import("@/app/admin/(dashboard)/widgets/actions")
  >["updateWidgetsAction"];

  beforeAll(async () => {
    createUserAction = (
      await import("@/app/admin/(dashboard)/users/actions")
    ).createUserAction;
    updateWidgetsAction = (
      await import("@/app/admin/(dashboard)/widgets/actions")
    ).updateWidgetsAction;
  });

  test("createUserAction (no permission) returns the noPermission code", async () => {
    const result = await createUserAction(undefined, new FormData());
    expect(result).toMatchObject({ ok: false, error: "admin.errors.noPermission" });
    expect((result as { error: string }).error).toMatch(CODE);
    expect((result as { error: string }).error).not.toContain(" ");
  });

  test("updateWidgetsAction (no permission) returns the noPermission code", async () => {
    const result = await updateWidgetsAction(undefined, new FormData());
    expect(result).toMatchObject({ ok: false, error: "admin.errors.noPermission" });
    expect((result as { error: string }).error).toMatch(CODE);
  });
});
