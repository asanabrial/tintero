import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "./src/lib/auth/session-token";

/**
 * Proxy (Next.js 16 middleware) — Layer 1 of two-layer route protection.
 * Optimistic JWT check only; no DB calls. Layer 2 (DAL) is authoritative.
 *
 * Handles /admin/:path* — blog routes are never intercepted (they stay prerendered).
 *
 * Login-loop guard: if the request is for /admin/login, allow it through
 * regardless of session state (authenticated users get redirected by this
 * same function to /admin, unauthenticated users see the login form).
 */
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get("session")?.value;
  // AUTH_SECRET may be undefined at prefetch time — verifyToken returns null safely.
  // The loud throw lives in session.ts (createSession path), not here.
  const secret = process.env.AUTH_SECRET;
  const payload =
    token && secret ? await verifyToken(token, secret) : null;

  // /install guard: redirect authenticated users to /admin; let others through.
  const isInstallPage = req.nextUrl.pathname === "/install";
  if (isInstallPage) {
    return payload
      ? NextResponse.redirect(new URL("/admin", req.nextUrl))
      : NextResponse.next();
  }

  const isLoginPage = req.nextUrl.pathname === "/admin/login";

  if (isLoginPage && payload) {
    // Already authenticated — redirect away from login to avoid re-login
    return NextResponse.redirect(new URL("/admin", req.nextUrl));
  }

  if (isLoginPage && !payload) {
    // Unauthenticated on login page — allow through
    return NextResponse.next();
  }

  if (!isLoginPage && !payload) {
    // Unauthenticated on a protected route — redirect to login
    return NextResponse.redirect(new URL("/admin/login", req.nextUrl));
  }

  // Optimistic author path-prefix redirect (cosmetic Layer-1 only).
  // Authoritative enforcement lives in DAL/page guards — this is UX-first, not a security boundary.
  const AUTHOR_BLOCKED = [
    "/admin/settings",
    "/admin/redirects",
    "/admin/appearance",
    "/admin/tools",
    "/admin/users",
    "/admin/pages",
    "/admin/categories",
    "/admin/tags",
    "/admin/menus",
    "/admin/comments",
  ];
  if (
    payload != null &&
    payload.role === "author" &&
    AUTHOR_BLOCKED.some((p) => req.nextUrl.pathname.startsWith(p))
  ) {
    return NextResponse.redirect(new URL("/admin", req.nextUrl));
  }

  // Authenticated on a protected route — pass through
  return NextResponse.next();
}

export const config = {
  // Match the bare /admin too (not only /admin/:something) so the optimistic
  // Layer-1 redirect fires for a direct hit on /admin.
  matcher: ["/admin", "/admin/:path*", "/install"],
};
