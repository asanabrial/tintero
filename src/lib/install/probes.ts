// probes.ts — Setup state machine for the /install wizard.
// Server-only. No next/* imports beyond types.
// All paths return a SetupState — NEVER throws.

import { getUserRepository } from "@/lib/auth/factory";
import type { UserRepository } from "@/lib/auth/ports";

export type SetupState =
  | "db-unreachable"   // DATABASE_URL missing OR connection refused/timeout
  | "schema-not-ready" // DB connected, but users table absent (pg 42P01)
  | "needs-admin"      // schema ready, zero admins
  | "complete";        // >= 1 admin exists

/**
 * Walks the error's .cause chain looking for a pg error code.
 * DrizzleQueryError wraps the original pg error in .cause (mirrors drizzle-adapter.ts pattern).
 */
function isUndefinedTable(err: unknown): boolean {
  for (let e: unknown = err; e != null; e = (e as Record<string, unknown>)?.cause) {
    if (
      typeof e === "object" &&
      e !== null &&
      (e as Record<string, unknown>)["code"] === "42P01"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Probes the current setup state with a single DB query.
 *
 * Injectable `repo` parameter (default: getUserRepository()) allows PGlite
 * adapters to be passed in tests without touching the env singleton.
 *
 * Classification:
 * - factory sync throw (no DATABASE_URL) → "db-unreachable"
 * - async reject with pg 42P01 (undefined_table) → "schema-not-ready"
 * - any other connection error → "db-unreachable"
 * - count === 0 → "needs-admin"
 * - count > 0  → "complete"
 */
export async function getSetupState(
  repo?: UserRepository
): Promise<SetupState> {
  let count: number;
  try {
    // Resolve the repo INSIDE the try: getUserRepository() throws synchronously
    // when DATABASE_URL is unset. As a default-parameter value that throw would
    // escape this try/catch and reject the promise instead of returning
    // "db-unreachable" (crashing /install with no DATABASE_URL). Tests still
    // inject a PGlite-backed adapter via the optional `repo` argument.
    const r = repo ?? getUserRepository();
    count = await r.countAdmins();
  } catch (err) {
    if (isUndefinedTable(err)) return "schema-not-ready";
    return "db-unreachable";
  }
  return count > 0 ? "complete" : "needs-admin";
}

/** Returns true if and only if setup is fully complete (>= 1 admin exists). */
export async function isSetupComplete(
  repo?: UserRepository
): Promise<boolean> {
  return (await getSetupState(repo)) === "complete";
}

/**
 * Returns true if the DB is reachable (even if schema is not yet applied).
 * "schema-not-ready" means the DB IS reachable — the connection succeeded.
 */
export async function isDbReachable(
  repo?: UserRepository
): Promise<boolean> {
  const s = await getSetupState(repo);
  return s !== "db-unreachable";
}

/**
 * Returns true if the users table exists (DB reachable + schema applied).
 */
export async function areTablesReady(
  repo?: UserRepository
): Promise<boolean> {
  const s = await getSetupState(repo);
  return s === "needs-admin" || s === "complete";
}
