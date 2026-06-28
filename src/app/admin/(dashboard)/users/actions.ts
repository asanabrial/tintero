"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getUserRepository } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { DuplicateEmailError } from "@/lib/auth";
import { CreateUserSchema, ChangePasswordSchema, ChangeUserRoleSchema } from "@/lib/auth/validation";
import { isDemotingLastAdmin } from "@/lib/auth/capabilities";
import { parseSelectedUserIds } from "./_components/parse-selected-user-ids";
import { selectableUserDeletions } from "./_components/selectable-user-deletions";

/**
 * Discriminated union action result for all users actions.
 * - { ok: true }  — success (action follows with redirect; island never sees this state)
 * - { ok: false } — validation or guard error; island renders inline
 * - undefined     — initial state (before first submission)
 *
 * `field` is present when the error maps to a specific form field;
 * absent (or "general") for guard-level errors (self-delete, last-admin, auth).
 */
export type UserActionState =
  | { ok: true }
  | { ok: false; error: string; field?: "email" | "password" | "role" | "general" }
  | undefined;

// ============================================================
// createUserAction
// ============================================================

/**
 * Server Action: create a new admin user.
 * verifySession() is the FIRST call — spec Auth Gate requirement.
 * Password is hashed before any DB write; plaintext is NEVER logged, echoed, or returned.
 */
export async function createUserAction(
  prevState: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const session = await verifySession();

  if (!can(session.role, "users:manage")) {
    return { ok: false, error: "admin.errors.noPermission", field: "general" };
  }

  const email = (formData.get("email") as string | null) ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const role = (formData.get("role") as string | null) ?? "admin";

  // Validate with shared schema (normalizes email: trim + toLowerCase)
  const parsed = CreateUserSchema.safeParse({ email, password, role });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const fieldPath = firstIssue?.path[0];
    const field: "email" | "password" | undefined =
      fieldPath === "email" ? "email"
      : fieldPath === "password" ? "password"
      : undefined;
    return {
      ok: false,
      error: firstIssue?.message ?? "Invalid input.",
      field,
    };
  }

  // Hash the password — plaintext is discarded after this point
  const passwordHash = await hashPassword(parsed.data.password);

  const name = (formData.get("name") as string | null) ?? "";
  const repo = getUserRepository();
  try {
    await repo.create({
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      name: name || undefined,
    });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return {
        ok: false,
        error: "admin.errors.userEmailExists",
        field: "email",
      };
    }
    // Unexpected persistence failure (DB connection, enum drift, constraint, etc.).
    // Log server-side for observability, then surface a friendly inline error
    // instead of letting it bubble up as an unhandled page-crashing Runtime Error.
    console.error("createUserAction: failed to persist user", err);
    return {
      ok: false,
      error: "admin.errors.userCreateFailed",
      field: "general",
    };
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

// ============================================================
// deleteUserFormAction — plain server form variant for the confirm page
// ============================================================

/**
 * Server Action: delete a user account — plain form action variant.
 * Used by the delete confirmation page (<form action={...}>) where no useActionState
 * island exists. Applies the same guards as deleteUserAction and redirects on all paths.
 * On guard failure, redirects back to /admin/users (the action error cannot be displayed
 * inline on a server-rendered form — the confirm page renders guard messages in the UI
 * as defense-in-depth before the form is shown).
 */
export async function deleteUserFormAction(
  targetId: string,
  _formData: FormData
): Promise<void> {
  const session = await verifySession();

  if (!can(session.role, "users:manage")) {
    redirect("/admin/users");
    return;
  }

  // Guard 1: self-delete (sync, no DB call)
  if (targetId === session.userId) {
    redirect("/admin/users");
    return;
  }

  const repo = getUserRepository();

  // Guard 2: last-admin. DB calls are wrapped so an unexpected failure degrades
  // to a redirect instead of a page-crashing Runtime Error. redirect() stays
  // OUTSIDE the try — it throws NEXT_REDIRECT, which must never be swallowed.
  let deleted = false;
  try {
    const adminCount = await repo.countAdmins();
    if (adminCount > 1) {
      await repo.deleteUser(targetId);
      deleted = true;
    }
  } catch (err) {
    console.error("deleteUserFormAction: failed to delete user", err);
  }

  if (deleted) {
    revalidatePath("/admin/users");
    revalidatePath("/admin/users/[id]/delete");
  }
  redirect("/admin/users");
}

// ============================================================
// updatePasswordAction
// ============================================================

/**
 * Server Action: update a user's password.
 * verifySession() is the FIRST call — spec Auth Gate requirement.
 * Any admin may change any user's password (including their own).
 * Changing own password does NOT invalidate the current session
 * (JWT does not carry the password hash — expected behavior, not a bug).
 * Password plaintext is NEVER logged, echoed, or returned.
 */
export async function updatePasswordAction(
  targetId: string,
  prevState: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const session = await verifySession();

  if (!can(session.role, "users:manage")) {
    return { ok: false, error: "admin.errors.noPermission", field: "general" };
  }

  const password = (formData.get("password") as string | null) ?? "";

  const parsed = ChangePasswordSchema.safeParse({ password });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      ok: false,
      error: firstIssue?.message ?? "Invalid password.",
      field: "password",
    };
  }

  // Hash before any DB call — plaintext discarded after this point
  const newHash = await hashPassword(parsed.data.password);

  const repo = getUserRepository();
  let updated: boolean;
  try {
    updated = await repo.updatePassword(targetId, newHash);
  } catch (err) {
    console.error("updatePasswordAction: failed to update password", err);
    return {
      ok: false,
      error: "admin.errors.userPasswordUpdateFailed",
      field: "general",
    };
  }
  if (!updated) {
    return {
      ok: false,
      error: "admin.errors.userNotFound",
      field: "general",
    };
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

// ============================================================
// updateUserRoleAction
// ============================================================

/**
 * Server Action: change an existing user's role.
 * verifySession() FIRST. Admin-only. Self-role-change is blocked (ADR-4).
 * Enforces the last-admin demotion invariant (ADR-3).
 * Guard order: (a) auth → (b) self-block → (c) schema → (d) findById → (e) last-admin → (f) updateRole.
 */
export async function updateUserRoleAction(
  targetId: string,
  prevState: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const session = await verifySession();

  // (a) auth gate
  if (!can(session.role, "users:manage")) {
    return { ok: false, error: "admin.errors.noPermission", field: "general" };
  }

  // (b) self-role-change block (sync, no DB)
  if (targetId === session.userId) {
    return { ok: false, error: "admin.errors.userCannotChangeOwnRole", field: "general" };
  }

  // (c) parse
  const role = (formData.get("role") as string | null) ?? "";
  const parsed = ChangeUserRoleSchema.safeParse({ role });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid role.", field: "role" };
  }

  const repo = getUserRepository();

  // DB calls (d)-(f) are wrapped: the not-found / last-admin returns are values
  // (not throws) so they still short-circuit normally, while an unexpected DB
  // error degrades to a friendly inline message. redirect() stays OUTSIDE the
  // try — it throws NEXT_REDIRECT, which must never be swallowed by catch.
  try {
    // (d) target exists?
    const target = await repo.findById(targetId);
    if (!target) {
      return { ok: false, error: "admin.errors.userNotFound", field: "general" };
    }

    // (e) last-admin invariant
    const adminCount = await repo.countAdmins();
    if (isDemotingLastAdmin(target.role, parsed.data.role, adminCount)) {
      return { ok: false, error: "admin.errors.userCannotDemoteLastAdmin", field: "general" };
    }

    // (f) persist
    await repo.updateRole(targetId, parsed.data.role);
  } catch (err) {
    console.error("updateUserRoleAction: failed to update role", err);
    return { ok: false, error: "admin.errors.userRoleUpdateFailed", field: "general" };
  }

  revalidatePath("/admin/users");
  redirect("/admin/users");
}

// ============================================================
// bulkDeleteUsersAction
// ============================================================

/**
 * Server Action: bulk-delete selected users.
 * verifySession() FIRST. Fail-closed RBAC. Roles re-resolved server-side — never
 * trusted from FormData. Self-skip and last-admin preservation enforced by
 * selectableUserDeletions (pure, unit-tested). Promise.allSettled for best-effort.
 */
export async function bulkDeleteUsersAction(formData: FormData): Promise<void> {
  // (a) auth FIRST
  const session = await verifySession();

  // (b) RBAC fail-closed
  if (!can(session.role, "users:manage")) {
    redirect("/admin");
    return;
  }

  // (c) parse + dedupe ids from FormData
  const ids = parseSelectedUserIds(formData);

  if (ids.length > 0) {
    const repo = getUserRepository();

    // DB resolution + deletes are wrapped so an unexpected failure (listUsers /
    // countAdmins throwing) degrades to a redirect instead of a page-crashing
    // Runtime Error. redirect() stays OUTSIDE — it throws NEXT_REDIRECT.
    try {
      // (d) resolve roles server-side BEFORE any delete — client cannot be trusted
      const allUsers = await repo.listUsers();
      const totalAdmins = await repo.countAdmins();
      const roleById = new Map(allUsers.map((u) => [u.id, u.role]));

      const candidates = ids
        .filter((id) => roleById.has(id)) // ignore unknown ids
        .map((id) => ({ id, role: roleById.get(id)! }));

      // (e) self-skip + last-admin budget
      const deletable = selectableUserDeletions(candidates, {
        selfId: session.userId,
        totalAdmins,
      });

      // (f) best-effort parallel delete
      await Promise.allSettled(deletable.map((id) => repo.deleteUser(id)));
    } catch (err) {
      console.error("bulkDeleteUsersAction: failed to delete users", err);
      // graceful — fall through to redirect instead of crashing
    }
  }

  // (g) invalidate BEFORE redirect (ADR-4); no cache tag for users route
  revalidatePath("/admin/users");
  redirect("/admin/users");
}
