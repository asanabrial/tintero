/**
 * LCD value helpers for the content DB layer.
 *
 * These are pure, side-effect-free utilities that implement the
 * lowest-common-denominator type policy from §4.3 of the architecture design:
 *
 *   - PKs:        app-generated UUID text (crypto.randomUUID())
 *   - Timestamps: epoch milliseconds stored as integer, UTC
 *   - Booleans:   integer 0/1 (no native boolean in SQLite)
 *
 * All functions are pure and require no imports beyond standard builtins.
 * They are the only place in the codebase that should call crypto.randomUUID()
 * or Date.now() for content-layer purposes — all adapters go through here.
 */

// ---------------------------------------------------------------------------
// Primary key generation
// ---------------------------------------------------------------------------

/**
 * Generate a new app-side UUID v4 for use as a text PK.
 * Never use DB-side uuid()/defaultRandom()/serial — see §4.3.
 */
export function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

/**
 * Current UTC time as epoch milliseconds.
 * Use this instead of `new Date()` or `Date.now()` directly in adapters.
 */
export function nowEpoch(): number {
  return Date.now();
}

/**
 * Convert a `Date` or an ISO 8601 date/datetime string to epoch milliseconds.
 *
 * The ISO string form handles the frontmatter `date: z.string().date()` value
 * (e.g. "2024-01-15"), which JavaScript's Date constructor parses as UTC midnight.
 */
export function toEpoch(date: Date | string): number {
  if (typeof date === "string") {
    return new Date(date).getTime();
  }
  return date.getTime();
}

/**
 * Convert epoch milliseconds back to a `Date`.
 * Use this at the read boundary — DB stores integers, app layer uses Date.
 */
export function fromEpoch(ms: number): Date {
  return new Date(ms);
}

// ---------------------------------------------------------------------------
// Boolean helpers (SQLite has no native boolean type)
// ---------------------------------------------------------------------------

/**
 * Boolean → 0 or 1 for storage in an integer column.
 */
export function toBool01(v: boolean): number {
  return v ? 1 : 0;
}

/**
 * 0 or 1 integer column value → boolean.
 * Non-zero integers are truthy per SQLite convention; this function
 * follows the strict 0 = false / non-zero = true rule.
 */
export function fromBool01(n: number): boolean {
  return n !== 0;
}
