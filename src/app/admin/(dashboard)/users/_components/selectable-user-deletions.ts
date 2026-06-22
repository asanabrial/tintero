import type { Role } from "@/lib/auth/types";

/**
 * A candidate user to evaluate for deletion eligibility.
 * Role is resolved server-side (never trusted from the client).
 */
export interface DeletionCandidate {
  id: string;
  role: Role;
}

/**
 * Context for the deletion safety computation.
 * Both fields are resolved server-side before calling.
 */
export interface DeletionContext {
  /** session.userId — this account is NEVER deletable, even if admin. */
  selfId: string;
  /** repo.countAdmins() resolved BEFORE any delete — whole-population count. */
  totalAdmins: number;
}

/**
 * Pure helper: given a list of candidate users and a deletion context, return the
 * subset of IDs that are SAFE to delete while preserving the last-admin invariant
 * and self-skip safety.
 *
 * Algorithm:
 *   adminBudget = max(0, totalAdmins - 1)   — admins that may be removed
 *   For each candidate (in order):
 *     - Skip if id === selfId (self NEVER deletable)
 *     - If role === "admin": include only if adminBudget > 0, then decrement budget
 *     - Otherwise: always include (non-admins freely deletable)
 *
 * No I/O or server dependencies — safe to unit-test with bun:test.
 */
export function selectableUserDeletions(
  candidates: DeletionCandidate[],
  ctx: DeletionContext
): string[] {
  let adminBudget = Math.max(0, ctx.totalAdmins - 1);
  const out: string[] = [];

  for (const c of candidates) {
    if (c.id === ctx.selfId) {
      // Self is never deletable — skip regardless of role
      continue;
    }
    if (c.role === "admin") {
      if (adminBudget > 0) {
        out.push(c.id);
        adminBudget -= 1;
      }
      // else: would breach last-admin invariant — skip
    } else {
      // Non-admin: always deletable
      out.push(c.id);
    }
  }

  return out;
}
