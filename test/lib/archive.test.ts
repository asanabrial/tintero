import { describe, expect, test } from "bun:test";
import {
  parseArchiveDate,
  parseYearParam,
  parseMonthParam,
  filterPostsByYear,
  filterPostsByYearMonth,
  buildArchiveIndex,
  formatPeriodLabel,
  MONTH_NAMES,
} from "../../src/lib/content/archive";
import type { Post } from "../../src/lib/content/types";

// Minimal Post fixture — only the fields the archive helpers read.
const mkPost = (slug: string, date: string): Post => ({
  slug,
  date,
  title: slug,
  status: "published",
  tags: [],
  categories: [],
  excerpt: "",
  html: "",
  comments: false,
  sticky: false,
  author: "Test Author",
  visibility: "public",
});

// ---------------------------------------------------------------------------
// parseArchiveDate
// ---------------------------------------------------------------------------

describe("parseArchiveDate", () => {
  test("valid date string 2025-06-15 → {year:2025, month:6}", () => {
    expect(parseArchiveDate("2025-06-15")).toEqual({ year: 2025, month: 6 });
  });

  test("zero-padded month 2025-01-05 → {year:2025, month:1}", () => {
    expect(parseArchiveDate("2025-01-05")).toEqual({ year: 2025, month: 1 });
  });

  test("malformed — missing day segment 2025-06 → null", () => {
    expect(parseArchiveDate("2025-06")).toBeNull();
  });

  test("malformed — only year 2025 → null", () => {
    expect(parseArchiveDate("2025")).toBeNull();
  });

  test("empty string → null", () => {
    expect(parseArchiveDate("")).toBeNull();
  });

  test("non-numeric segments abc-def-ghi → null", () => {
    expect(parseArchiveDate("abc-def-ghi")).toBeNull();
  });

  test("month out of range low: 2025-00-01 → null", () => {
    expect(parseArchiveDate("2025-00-01")).toBeNull();
  });

  test("month out of range high: 2025-13-01 → null", () => {
    expect(parseArchiveDate("2025-13-01")).toBeNull();
  });

  test("boundary month 1: 2025-01-01 → {year:2025, month:1}", () => {
    expect(parseArchiveDate("2025-01-01")).toEqual({ year: 2025, month: 1 });
  });

  test("boundary month 12: 2025-12-31 → {year:2025, month:12}", () => {
    expect(parseArchiveDate("2025-12-31")).toEqual({ year: 2025, month: 12 });
  });
});

// ---------------------------------------------------------------------------
// parseYearParam
// ---------------------------------------------------------------------------

describe("parseYearParam", () => {
  test('"2025" → 2025', () => {
    expect(parseYearParam("2025")).toBe(2025);
  });

  test('"abc" → null', () => {
    expect(parseYearParam("abc")).toBeNull();
  });

  test('"999" (3 digits) → null', () => {
    expect(parseYearParam("999")).toBeNull();
  });

  test('"10000" (5 digits) → null', () => {
    expect(parseYearParam("10000")).toBeNull();
  });

  test('"2025x" (non-numeric suffix) → null', () => {
    expect(parseYearParam("2025x")).toBeNull();
  });

  test('"1000" (lower boundary) → 1000', () => {
    expect(parseYearParam("1000")).toBe(1000);
  });

  test('"9999" (upper boundary) → 9999', () => {
    expect(parseYearParam("9999")).toBe(9999);
  });

  test('empty string → null', () => {
    expect(parseYearParam("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseMonthParam
// ---------------------------------------------------------------------------

describe("parseMonthParam", () => {
  test('"6" → 6', () => {
    expect(parseMonthParam("6")).toBe(6);
  });

  test('"06" → 6', () => {
    expect(parseMonthParam("06")).toBe(6);
  });

  test('"0" → null', () => {
    expect(parseMonthParam("0")).toBeNull();
  });

  test('"13" → null', () => {
    expect(parseMonthParam("13")).toBeNull();
  });

  test('"-1" → null', () => {
    expect(parseMonthParam("-1")).toBeNull();
  });

  test('"jan" → null', () => {
    expect(parseMonthParam("jan")).toBeNull();
  });

  test('"1" (boundary low) → 1', () => {
    expect(parseMonthParam("1")).toBe(1);
  });

  test('"12" (boundary high) → 12', () => {
    expect(parseMonthParam("12")).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// filterPostsByYear
// ---------------------------------------------------------------------------

describe("filterPostsByYear", () => {
  test("multi-year fixture isolates 2025 posts", () => {
    const posts = [
      mkPost("p1", "2025-11-30"),
      mkPost("p2", "2025-01-15"),
      mkPost("p3", "2024-03-01"),
    ];
    const result = filterPostsByYear(posts, 2025);
    expect(result.map((p) => p.slug)).toEqual(["p1", "p2"]);
  });

  test("no match returns []", () => {
    const posts = [mkPost("p1", "2024-03-01")];
    expect(filterPostsByYear(posts, 2025)).toEqual([]);
  });

  test("boundary months January and December are included", () => {
    const posts = [mkPost("jan", "2025-01-01"), mkPost("dec", "2025-12-31")];
    const result = filterPostsByYear(posts, 2025);
    expect(result.map((p) => p.slug)).toContain("jan");
    expect(result.map((p) => p.slug)).toContain("dec");
  });

  test("empty input returns []", () => {
    expect(filterPostsByYear([], 2025)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// filterPostsByYearMonth
// ---------------------------------------------------------------------------

describe("filterPostsByYearMonth", () => {
  test("two June posts returned, July excluded", () => {
    const posts = [
      mkPost("p1", "2025-06-15"),
      mkPost("p2", "2025-06-01"),
      mkPost("p3", "2025-07-01"),
    ];
    const result = filterPostsByYearMonth(posts, 2025, 6);
    expect(result.map((p) => p.slug)).toEqual(["p1", "p2"]);
  });

  test("no match returns []", () => {
    const posts = [mkPost("p1", "2025-05-01"), mkPost("p2", "2025-07-01")];
    expect(filterPostsByYearMonth(posts, 2025, 6)).toEqual([]);
  });

  test("cross-year isolation: 2024-06 excluded from 2025-06 filter", () => {
    const posts = [mkPost("a", "2025-06-01"), mkPost("b", "2024-06-01")];
    const result = filterPostsByYearMonth(posts, 2025, 6);
    expect(result.map((p) => p.slug)).toEqual(["a"]);
  });

  test("boundary month 1 (January)", () => {
    const posts = [mkPost("jan", "2025-01-15"), mkPost("feb", "2025-02-01")];
    const result = filterPostsByYearMonth(posts, 2025, 1);
    expect(result.map((p) => p.slug)).toEqual(["jan"]);
  });

  test("boundary month 12 (December)", () => {
    const posts = [mkPost("dec", "2025-12-25"), mkPost("nov", "2025-11-01")];
    const result = filterPostsByYearMonth(posts, 2025, 12);
    expect(result.map((p) => p.slug)).toEqual(["dec"]);
  });

  test("empty input returns []", () => {
    expect(filterPostsByYearMonth([], 2025, 6)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildArchiveIndex
// ---------------------------------------------------------------------------

describe("buildArchiveIndex", () => {
  test("multiple periods sorted year desc then month desc", () => {
    const posts = [
      mkPost("p1", "2025-06-01"),
      mkPost("p2", "2025-06-15"),
      mkPost("p3", "2025-11-01"),
      mkPost("p4", "2024-03-01"),
    ];
    const result = buildArchiveIndex(posts);
    expect(result).toEqual([
      { year: 2025, month: 11, count: 1 },
      { year: 2025, month: 6, count: 2 },
      { year: 2024, month: 3, count: 1 },
    ]);
  });

  test("empty input returns []", () => {
    expect(buildArchiveIndex([])).toEqual([]);
  });

  test("posts with unparseable dates excluded from count", () => {
    const posts = [mkPost("bad", ""), mkPost("good", "2025-06-01")];
    const result = buildArchiveIndex(posts);
    expect(result).toEqual([{ year: 2025, month: 6, count: 1 }]);
  });

  test("accurate count for same year/month", () => {
    const posts = [
      mkPost("p1", "2025-06-01"),
      mkPost("p2", "2025-06-15"),
      mkPost("p3", "2025-06-30"),
    ];
    const result = buildArchiveIndex(posts);
    expect(result).toEqual([{ year: 2025, month: 6, count: 3 }]);
  });
});

// ---------------------------------------------------------------------------
// formatPeriodLabel
// ---------------------------------------------------------------------------

describe("formatPeriodLabel", () => {
  test("year only → '2025'", () => {
    expect(formatPeriodLabel(2025)).toBe("2025");
  });

  test("year + month 6 → 'June 2025'", () => {
    expect(formatPeriodLabel(2025, 6)).toBe("June 2025");
  });

  test("boundary month 1 → 'January 2025'", () => {
    expect(formatPeriodLabel(2025, 1)).toBe("January 2025");
  });

  test("boundary month 12 → 'December 2025'", () => {
    expect(formatPeriodLabel(2025, 12)).toBe("December 2025");
  });

  test("MONTH_NAMES has 12 entries", () => {
    expect(MONTH_NAMES.length).toBe(12);
  });
});
