"use server";

import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { addRedirect, removeRedirect } from "@/lib/seo/redirect-writer";

/** Ensure a path-like source starts with a single leading slash. */
function withLeadingSlash(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return trimmed.startsWith("/") || /^https?:\/\//.test(trimmed) ? trimmed : `/${trimmed}`;
}

export async function addRedirectAction(formData: FormData): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "settings:manage")) return;

  const from = withLeadingSlash((formData.get("from") as string | null) ?? "");
  const to = withLeadingSlash((formData.get("to") as string | null) ?? "");
  const permanent = formData.get("permanent") === "on";
  if (!from || !to) return;

  await addRedirect({ from, to, permanent });
  redirect("/admin/redirects");
}

export async function deleteRedirectAction(formData: FormData): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "settings:manage")) return;

  const from = ((formData.get("from") as string | null) ?? "").trim();
  if (from) await removeRedirect(from);
  redirect("/admin/redirects");
}
