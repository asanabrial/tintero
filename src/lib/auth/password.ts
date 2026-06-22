// Password hashing utilities — pure, no React/Next imports.
// Uses bcryptjs (pure JS, timing-safe compare).

import * as bcrypt from "bcryptjs";

const COST_FACTOR = 10;

/**
 * Hashes a plaintext password using bcryptjs with cost factor 10.
 * The returned hash is safe to store in the database.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST_FACTOR);
}

/**
 * Verifies a plaintext candidate against a stored bcrypt hash.
 * Uses bcryptjs.compare for timing-safe comparison.
 */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
