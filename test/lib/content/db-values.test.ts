/**
 * Unit tests for the LCD value helpers in src/lib/content/db-values.ts.
 *
 * These are pure-function tests — no DB connection needed, no mocks.
 * Follows the LCD policy from §4.3 of the architecture design:
 *   - UUID PKs: app-generated, crypto.randomUUID()
 *   - Timestamps: epoch milliseconds (integer)
 *   - Booleans: integer 0/1
 */
import { describe, expect, test } from "bun:test";
import {
  fromBool01,
  fromEpoch,
  newId,
  nowEpoch,
  toBool01,
  toEpoch,
} from "../../../src/lib/content/db-values";

// UUID v4 canonical form: 8-4-4-4-12 hex, version=4, variant=8/9/a/b
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// newId
// ---------------------------------------------------------------------------

describe("newId", () => {
  test("returns a string that matches UUID v4 format", () => {
    const id = newId();
    expect(id).toBeString();
    expect(id).toMatch(UUID_V4_PATTERN);
  });

  test("two successive calls return different values (uniqueness)", () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// nowEpoch
// ---------------------------------------------------------------------------

describe("nowEpoch", () => {
  test("returns a number close to Date.now()", () => {
    const before = Date.now();
    const result = nowEpoch();
    const after = Date.now();
    // Must be between before and after inclusive
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  test("returns an integer (epoch ms is always an integer)", () => {
    const result = nowEpoch();
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toEpoch — Date input
// ---------------------------------------------------------------------------

describe("toEpoch — Date input", () => {
  test("Date(0) → 0", () => {
    expect(toEpoch(new Date(0))).toBe(0);
  });

  test("Date(1_000) → 1000", () => {
    expect(toEpoch(new Date(1_000))).toBe(1_000);
  });

  test("known Date returns the same ms as getTime()", () => {
    const d = new Date("2024-06-25T12:00:00.000Z");
    expect(toEpoch(d)).toBe(d.getTime());
  });
});

// ---------------------------------------------------------------------------
// toEpoch — ISO string input (frontmatter date: z.string().date() form)
// ---------------------------------------------------------------------------

describe("toEpoch — ISO string input", () => {
  test("ISO date-only string '2024-01-15' → UTC midnight epoch", () => {
    // ISO 8601 date-only parses as UTC midnight per spec
    expect(toEpoch("2024-01-15")).toBe(new Date("2024-01-15").getTime());
  });

  test("ISO datetime string '2024-06-25T00:00:00.000Z' → expected epoch", () => {
    expect(toEpoch("2024-06-25T00:00:00.000Z")).toBe(
      new Date("2024-06-25T00:00:00.000Z").getTime()
    );
  });

  test("string with different timestamp returns a different value than another string", () => {
    const t1 = toEpoch("2024-01-01");
    const t2 = toEpoch("2025-01-01");
    expect(t2).toBeGreaterThan(t1);
  });
});

// ---------------------------------------------------------------------------
// fromEpoch
// ---------------------------------------------------------------------------

describe("fromEpoch", () => {
  test("0 → Date(0)", () => {
    expect(fromEpoch(0)).toEqual(new Date(0));
  });

  test("1000 → Date(1000)", () => {
    expect(fromEpoch(1_000)).toEqual(new Date(1_000));
  });

  test("returns a Date instance", () => {
    expect(fromEpoch(12345678)).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: toEpoch ↔ fromEpoch
// ---------------------------------------------------------------------------

describe("round-trip toEpoch / fromEpoch", () => {
  test("Date → epoch → Date preserves value", () => {
    const original = new Date("2024-06-25T12:34:56.789Z");
    expect(fromEpoch(toEpoch(original))).toEqual(original);
  });

  test("ISO string → epoch → Date equals new Date(isoString)", () => {
    const iso = "2023-12-31";
    expect(fromEpoch(toEpoch(iso))).toEqual(new Date(iso));
  });
});

// ---------------------------------------------------------------------------
// toBool01
// ---------------------------------------------------------------------------

describe("toBool01", () => {
  test("true → 1", () => {
    expect(toBool01(true)).toBe(1);
  });

  test("false → 0", () => {
    expect(toBool01(false)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fromBool01
// ---------------------------------------------------------------------------

describe("fromBool01", () => {
  test("1 → true", () => {
    expect(fromBool01(1)).toBe(true);
  });

  test("0 → false", () => {
    expect(fromBool01(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: toBool01 ↔ fromBool01
// ---------------------------------------------------------------------------

describe("round-trip toBool01 / fromBool01", () => {
  test("true round-trips", () => {
    expect(fromBool01(toBool01(true))).toBe(true);
  });

  test("false round-trips", () => {
    expect(fromBool01(toBool01(false))).toBe(false);
  });
});
