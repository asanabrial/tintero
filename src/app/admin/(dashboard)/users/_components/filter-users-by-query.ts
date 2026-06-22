import type { PublicUser } from "@/lib/auth/types";

/**
 * Pure helper — filters users by email substring, case-insensitively.
 * Empty or whitespace-only q returns the full input array unchanged.
 * No React/Next.js imports; safe to use in tests without a DOM.
 */
export function filterUsersByQuery(users: PublicUser[], q: string): PublicUser[] {
  const needle = q.trim().toLowerCase();
  if (needle === "") return users;
  return users.filter((u) => u.email.toLowerCase().includes(needle));
}
