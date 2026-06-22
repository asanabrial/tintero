"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getUserRepository, hashPassword } from "@/lib/auth";
import { ChangePasswordSchema } from "@/lib/auth/validation";

export type ProfileActionState =
  | { ok: true }
  | { ok: false; error: string; field?: "password" | "name" | "bio" | "general" }
  | undefined;

/**
 * Server Action: change the CURRENT user's own password.
 * verifySession() is FIRST. Target is ALWAYS session.userId (cannot target others).
 * ChangePasswordSchema requires only a new password (no current-password challenge),
 * matching the existing updatePasswordAction behavior.
 * Changing the own password does NOT invalidate the JWT (no hash in token) — stays logged in.
 */
export async function updateOwnPasswordAction(
  _prev: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const session = await verifySession();

  // Defensive gate: all authenticated roles have profile:own (admin/editor/author all pass).
  if (!can(session.role, "profile:own")) {
    return { ok: false, error: "You do not have permission to perform this action.", field: "general" };
  }

  const password = (formData.get("password") as string | null) ?? "";
  const parsed = ChangePasswordSchema.safeParse({ password });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { ok: false, error: firstIssue?.message ?? "Invalid password.", field: "password" };
  }

  const newHash = await hashPassword(parsed.data.password);
  const updated = await getUserRepository().updatePassword(session.userId, newHash);
  if (!updated) {
    return { ok: false, error: "Account not found.", field: "general" };
  }

  redirect("/admin/profile?saved=1");
}

/**
 * Server Action: update the current user's display name and bio.
 * verifySession() is FIRST. Target is ALWAYS session.userId.
 */
export async function updateProfileAction(
  _prev: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const session = await verifySession();

  if (!can(session.role, "profile:own")) {
    return { ok: false, error: "You do not have permission to perform this action.", field: "general" };
  }

  const name = ((formData.get("name") as string | null) ?? "").trim() || null;
  const bio = ((formData.get("bio") as string | null) ?? "").trim() || null;

  try {
    await getUserRepository().updateProfile(session.userId, { name, bio });
  } catch {
    return { ok: false, error: "Could not update your profile right now. Please try again.", field: "general" };
  }

  revalidatePath("/admin/profile");
  redirect("/admin/profile?saved=1");
}
