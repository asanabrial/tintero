import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { AuthSession } from "./types";
import { isKnownRole } from "./types";
import { readSessionCookie } from "./session";
import { getUserRepository } from "./factory";

/**
 * Authoritative session verification — called at the top of every admin page
 * and every admin Server Action.
 *
 * Two-layer check:
 * 1. Verifies the session JWT (signature + expiry).
 * 2. Confirms the user still exists in the database with role 'admin'.
 *
 * Redirects to /admin/login on any failure.
 * Wrapped in react cache() for per-request deduplication.
 */
export const verifySession = cache(async (): Promise<AuthSession> => {
  const payload = await readSessionCookie();

  if (!payload) {
    redirect("/admin/login");
  }

  // Confirm user still exists and has admin role (authoritative DB check)
  const user = await getUserRepository().findById(payload.userId);

  // Whitelist guard (ADR-R2): fails closed on unknown/null/empty roles.
  // NEVER use a blacklist (!=== "admin") — that would pass unknown roles through.
  if (!user || !isKnownRole(user.role)) {
    redirect("/admin/login");
  }

  return {
    isAuth: true,
    userId: user.id,
    role: user.role,
  };
});
