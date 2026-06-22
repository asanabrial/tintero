// capabilities.ts — PURE capability core.
// ZERO imports from Next.js, React, pg, or any FS/DB module.
// This module is the single source of truth for what each role can do.

import type { Role } from "./types";

// ============================================================
// Action union — exhaustive set of all permission checks
// ============================================================

export type Action =
  | "posts:create"
  | "posts:edit:any"
  | "posts:delete:any"
  | "posts:edit:own"
  | "posts:delete:own"
  | "pages:create"
  | "pages:edit"
  | "pages:delete"
  | "media:upload"
  | "media:delete"
  | "comments:moderate"
  | "categories:manage"
  | "tags:manage"
  | "menus:manage"
  | "appearance:manage"
  | "settings:manage"
  | "users:manage"
  | "tools:access"
  | "profile:own";

// ============================================================
// Capability context — supplied for ownership-gated checks
// ============================================================

export interface CapabilityContext {
  postAuthorId?: string | null;
  userId?: string;
}

// ============================================================
// Static capability sets per role
// ============================================================

const ALL_ACTIONS: readonly Action[] = [
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

const EDITOR_ACTIONS: readonly Action[] = [
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
];

// Author static caps. posts:edit:own/delete:own are STATIC-true here but the
// authorId match is ADDITIONALLY enforced by can()'s ownership branch via ctx.
const AUTHOR_ACTIONS: readonly Action[] = [
  "posts:create",
  "posts:edit:own",
  "posts:delete:own",
  "media:upload",
  "profile:own",
];

const CAPS: Record<Role, Set<Action>> = {
  admin: new Set(ALL_ACTIONS),
  editor: new Set(EDITOR_ACTIONS),
  author: new Set(AUTHOR_ACTIONS),
};

// Ownership actions that additionally require an authorId match when ctx is provided.
const OWNERSHIP_ACTIONS = new Set<Action>([
  "posts:edit:own",
  "posts:delete:own",
]);

// Maps ownership-scoped actions to their unrestricted any-scope counterpart.
// If a role has the :any variant, the ownership check is skipped.
const OWNERSHIP_TO_ANY: Partial<Record<Action, Action>> = {
  "posts:edit:own": "posts:edit:any",
  "posts:delete:own": "posts:delete:any",
};

// ============================================================
// can() — core capability check
// ============================================================

/**
 * Returns true if `role` may perform `action`.
 *
 * For ownership actions (`posts:edit:own`, `posts:delete:own`):
 * - Without `ctx`: returns the static boolean (role has the capability).
 * - With `ctx` where either `postAuthorId` or `userId` is non-null/non-undefined:
 *   ADDITIONALLY requires `ctx.postAuthorId === ctx.userId` (both non-null).
 *
 * This means:
 * - `can("author", "posts:edit:own")` → true (static; no ctx)
 * - `can("author", "posts:edit:own", { postAuthorId: "u1", userId: "u1" })` → true (match)
 * - `can("author", "posts:edit:own", { postAuthorId: "u2", userId: "u1" })` → false (mismatch)
 * - `can("author", "posts:edit:own", { postAuthorId: undefined, userId: "u1" })` → false (no author)
 */
export function can(
  role: Role,
  action: Action,
  ctx?: CapabilityContext
): boolean {
  if (!CAPS[role]?.has(action)) return false;

  // Ownership actions require matching authorId when ctx is supplied with at least one id set.
  // Exception: if the role ALSO has the corresponding :any action, skip the ownership check
  // (admin/editor can do :any, so the :own check is always permitted for them).
  if (OWNERSHIP_ACTIONS.has(action) && ctx !== undefined) {
    const anyAction = OWNERSHIP_TO_ANY[action];
    const hasAny = anyAction !== undefined && CAPS[role]?.has(anyAction);
    if (!hasAny && (ctx.postAuthorId != null || ctx.userId != null)) {
      return (
        ctx.postAuthorId != null &&
        ctx.userId != null &&
        ctx.postAuthorId === ctx.userId
      );
    }
  }

  return true;
}

// ============================================================
// canEditPost / canDeletePost — pure ownership helpers
// ============================================================

/**
 * Pure post-edit authorization helper (ADR-R4).
 * Returns true when:
 * - The role can edit ANY post (`posts:edit:any`), OR
 * - The role can edit OWN posts AND `postAuthorId === userId` (both non-null).
 *
 * Pre-RBAC posts (postAuthorId undefined/null) → Author DENIED.
 */
export function canEditPost(
  role: Role,
  postAuthorId: string | null | undefined,
  userId: string
): boolean {
  if (can(role, "posts:edit:any")) return true;
  return (
    can(role, "posts:edit:own") &&
    postAuthorId != null &&
    postAuthorId === userId
  );
}

/**
 * Pure post-delete authorization helper (ADR-R4).
 * Returns true when:
 * - The role can delete ANY post (`posts:delete:any`), OR
 * - The role can delete OWN posts AND `postAuthorId === userId` (both non-null).
 *
 * Pre-RBAC posts (postAuthorId undefined/null) → Author DENIED.
 */
export function canDeletePost(
  role: Role,
  postAuthorId: string | null | undefined,
  userId: string
): boolean {
  if (can(role, "posts:delete:any")) return true;
  return (
    can(role, "posts:delete:own") &&
    postAuthorId != null &&
    postAuthorId === userId
  );
}

/**
 * Last-admin demotion invariant (PURE).
 * Returns true IFF the change would remove the site's final admin:
 * the target is currently an admin, the new role is NOT admin,
 * and there is at most one admin remaining.
 */
export function isDemotingLastAdmin(
  targetCurrentRole: Role,
  newRole: Role,
  adminCount: number
): boolean {
  return targetCurrentRole === "admin" && newRole !== "admin" && adminCount <= 1;
}
