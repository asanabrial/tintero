import { describe, expect, test } from "bun:test";
import {
  can,
  canEditPost,
  canDeletePost,
  isDemotingLastAdmin,
} from "../../../src/lib/auth/capabilities";
import type { Action } from "../../../src/lib/auth/capabilities";
import type { Role } from "../../../src/lib/auth/types";

// ============================================================
// Matrix-driven exhaustive test
// 3 roles x 19 actions = 57 static cases
// ============================================================

const ALL_ACTIONS: Action[] = [
  "posts:create",
  "posts:edit:any",
  "posts:delete:any",
  "posts:edit:own",
  "posts:delete:own",
  "pages:create",
  "pages:edit",
  "pages:delete",
  "media:upload",
  "media:delete",
  "comments:moderate",
  "categories:manage",
  "tags:manage",
  "menus:manage",
  "appearance:manage",
  "settings:manage",
  "users:manage",
  "tools:access",
  "profile:own",
];

const ROLES: Role[] = ["admin", "editor", "author"];

// Expected capability matrix — locked per spec
const EXPECT: Record<Role, Set<Action>> = {
  admin: new Set(ALL_ACTIONS),
  editor: new Set([
    "posts:create",
    "posts:edit:any",
    "posts:delete:any",
    "posts:edit:own",
    "posts:delete:own",
    "pages:create",
    "pages:edit",
    "pages:delete",
    "media:upload",
    "media:delete",
    "comments:moderate",
    "categories:manage",
    "tags:manage",
    "menus:manage",
    "profile:own",
  ] as Action[]),
  author: new Set([
    "posts:create",
    "posts:edit:own",
    "posts:delete:own",
    "media:upload",
    "profile:own",
  ] as Action[]),
};

describe("can() — matrix exhaustive (3 roles × 19 actions = 57 cases)", () => {
  for (const role of ROLES) {
    for (const action of ALL_ACTIONS) {
      const expected = EXPECT[role].has(action);
      test(`can("${role}", "${action}") === ${expected}`, () => {
        // For ownership actions called WITHOUT ctx, the static cap is checked only.
        // The can() implementation returns true for the static check when role has the action.
        expect(can(role, action)).toBe(expected);
      });
    }
  }
});

// ============================================================
// canEditPost — ownership helper
// ============================================================

describe("canEditPost()", () => {
  test("author owns post (matching IDs) → true", () => {
    expect(canEditPost("author", "u1", "u1")).toBe(true);
  });

  test("author does not own post (mismatched IDs) → false", () => {
    expect(canEditPost("author", "u2", "u1")).toBe(false);
  });

  test("author with null postAuthorId (pre-RBAC post) → false", () => {
    expect(canEditPost("author", null, "u1")).toBe(false);
  });

  test("author with undefined postAuthorId (pre-RBAC post) → false", () => {
    expect(canEditPost("author", undefined, "u1")).toBe(false);
  });

  test("editor can edit ANY post (does not require ownership) → true", () => {
    expect(canEditPost("editor", "u2", "u1")).toBe(true);
  });

  test("editor with null postAuthorId → true (edit:any)", () => {
    expect(canEditPost("editor", null, "u1")).toBe(true);
  });

  test("admin can edit ANY post → true", () => {
    expect(canEditPost("admin", null, "u1")).toBe(true);
  });

  test("admin can edit ANY post (mismatched IDs) → true", () => {
    expect(canEditPost("admin", "u2", "u1")).toBe(true);
  });
});

// ============================================================
// canDeletePost — ownership helper
// ============================================================

describe("canDeletePost()", () => {
  test("author owns post (matching IDs) → true", () => {
    expect(canDeletePost("author", "u1", "u1")).toBe(true);
  });

  test("author does not own post (mismatched IDs) → false", () => {
    expect(canDeletePost("author", "u2", "u1")).toBe(false);
  });

  test("author with null postAuthorId (pre-RBAC post) → false", () => {
    expect(canDeletePost("author", null, "u1")).toBe(false);
  });

  test("author with undefined postAuthorId (pre-RBAC post) → false", () => {
    expect(canDeletePost("author", undefined, "u1")).toBe(false);
  });

  test("editor can delete ANY post → true", () => {
    expect(canDeletePost("editor", "u2", "u1")).toBe(true);
  });

  test("editor with null postAuthorId → true (delete:any)", () => {
    expect(canDeletePost("editor", null, "u1")).toBe(true);
  });

  test("admin can delete ANY post → true", () => {
    expect(canDeletePost("admin", null, "u1")).toBe(true);
  });
});

// ============================================================
// isDemotingLastAdmin() — pure guard
// ============================================================

describe("isDemotingLastAdmin()", () => {
  test("admin → editor, adminCount=1 → true (only admin being demoted)", () => {
    expect(isDemotingLastAdmin("admin", "editor", 1)).toBe(true);
  });

  test("admin → editor, adminCount=2 → false (another admin exists)", () => {
    expect(isDemotingLastAdmin("admin", "editor", 2)).toBe(false);
  });

  test("admin → admin, adminCount=1 → false (no-op, role unchanged)", () => {
    expect(isDemotingLastAdmin("admin", "admin", 1)).toBe(false);
  });

  test("editor → admin, adminCount=1 → false (target is not admin)", () => {
    expect(isDemotingLastAdmin("editor", "admin", 1)).toBe(false);
  });

  test("author → editor, adminCount=1 → false (target is not admin)", () => {
    expect(isDemotingLastAdmin("author", "editor", 1)).toBe(false);
  });

  test("admin → author, adminCount=1 → true (demoting last admin to author)", () => {
    expect(isDemotingLastAdmin("admin", "author", 1)).toBe(true);
  });
});

// ============================================================
// can() with ownership ctx — ownership branch
// ============================================================

describe("can() with CapabilityContext for ownership actions", () => {
  test('can("author","posts:edit:own",{postAuthorId:"u1",userId:"u1"}) === true', () => {
    expect(can("author", "posts:edit:own", { postAuthorId: "u1", userId: "u1" })).toBe(true);
  });

  test('can("author","posts:edit:own",{postAuthorId:"u2",userId:"u1"}) === false', () => {
    expect(can("author", "posts:edit:own", { postAuthorId: "u2", userId: "u1" })).toBe(false);
  });

  test('can("author","posts:edit:own",{postAuthorId:undefined,userId:"u1"}) === false', () => {
    expect(can("author", "posts:edit:own", { postAuthorId: undefined, userId: "u1" })).toBe(false);
  });

  test('can("author","posts:delete:own",{postAuthorId:"u1",userId:"u1"}) === true', () => {
    expect(can("author", "posts:delete:own", { postAuthorId: "u1", userId: "u1" })).toBe(true);
  });

  test('can("author","posts:delete:own",{postAuthorId:"u2",userId:"u1"}) === false', () => {
    expect(can("author", "posts:delete:own", { postAuthorId: "u2", userId: "u1" })).toBe(false);
  });

  // Editor with ownership ctx for own-scoped actions → still true (has edit:any)
  test('can("editor","posts:edit:own",{postAuthorId:"u2",userId:"u1"}) === true', () => {
    expect(can("editor", "posts:edit:own", { postAuthorId: "u2", userId: "u1" })).toBe(true);
  });
});
