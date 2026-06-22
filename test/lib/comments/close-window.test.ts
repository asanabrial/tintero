import { describe, expect, test } from "bun:test";
import { areCommentsClosed } from "../../../src/lib/comments/close-window";

describe("areCommentsClosed", () => {
  test("returns false when closeAfterDays is 0 (never close)", () => {
    expect(areCommentsClosed("2020-01-01", 0, "2026-01-01T00:00:00Z")).toBe(false);
  });

  test("returns false within the window", () => {
    // 10 days old, window 30 days
    expect(areCommentsClosed("2026-01-01", 30, "2026-01-11T00:00:00Z")).toBe(false);
  });

  test("returns true past the window", () => {
    // 40 days old, window 30 days
    expect(areCommentsClosed("2026-01-01", 30, "2026-02-10T00:00:00Z")).toBe(true);
  });

  test("boundary: exactly at the window is NOT closed (strictly greater)", () => {
    // exactly 30 days
    expect(areCommentsClosed("2026-01-01", 30, "2026-01-31T00:00:00Z")).toBe(false);
  });

  test("fails open on invalid post date", () => {
    expect(areCommentsClosed("not-a-date", 30, "2026-02-10T00:00:00Z")).toBe(false);
  });

  test("fails open on invalid now", () => {
    expect(areCommentsClosed("2026-01-01", 30, "not-a-date")).toBe(false);
  });

  test("fails open on negative window", () => {
    expect(areCommentsClosed("2020-01-01", -5, "2026-01-01T00:00:00Z")).toBe(false);
  });
});
