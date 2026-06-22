// Pure archive helpers — no React/Next.js/fs/Date imports.
// Mirrors the category.ts module style.

import type { Post } from "./types";
import type { ArchivePeriod } from "./types";

export type { ArchivePeriod };

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Parse a YYYY-MM-DD date string into { year, month } using parseInt only.
 * Returns null for malformed, empty, non-numeric, or out-of-range inputs.
 * NEVER uses new Date().
 */
export function parseArchiveDate(
  dateStr: string
): { year: number; month: number } | null {
  if (!dateStr) return null;
  const segments = dateStr.split("-");
  if (segments.length < 3) return null;
  const year = parseInt(segments[0], 10);
  const month = parseInt(segments[1], 10);
  const day = parseInt(segments[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (year < 1000 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month };
}

/**
 * Validate and parse a year route param string.
 * Returns the year as a number if it is a valid 4-digit integer (1000–9999),
 * or null otherwise. Never uses new Date().
 */
export function parseYearParam(s: string): number | null {
  if (!s || s.length !== 4) return null;
  const n = parseInt(s, 10);
  if (isNaN(n)) return null;
  if (n < 1000 || n > 9999) return null;
  // Ensure the whole string is numeric (no trailing chars like "2025x")
  if (String(n) !== s) return null;
  return n;
}

/**
 * Validate and parse a month route param string.
 * Accepts both "6" and "06". Returns the month as 1–12 or null.
 * Never uses new Date().
 */
export function parseMonthParam(s: string): number | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  if (isNaN(n)) return null;
  if (n < 1 || n > 12) return null;
  return n;
}

/**
 * Return only posts whose parsed date year equals the given year.
 * Preserves input order (listPosts returns date-desc already).
 */
export function filterPostsByYear(posts: Post[], year: number): Post[] {
  return posts.filter((post) => parseArchiveDate(post.date)?.year === year);
}

/**
 * Return only posts whose parsed date year AND month match the given values.
 * Preserves input order (listPosts returns date-desc already).
 */
export function filterPostsByYearMonth(
  posts: Post[],
  year: number,
  month: number
): Post[] {
  return posts.filter((post) => {
    const parsed = parseArchiveDate(post.date);
    return parsed?.year === year && parsed?.month === month;
  });
}

/**
 * Group posts by year+month, count, and sort year descending then month descending.
 * Posts with unparseable dates are excluded.
 */
export function buildArchiveIndex(posts: Post[]): ArchivePeriod[] {
  const map = new Map<string, ArchivePeriod>();

  for (const post of posts) {
    const parsed = parseArchiveDate(post.date);
    if (parsed === null) continue;
    const key = `${parsed.year}-${parsed.month}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { year: parsed.year, month: parsed.month, count: 1 });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.month - a.month;
  });
}

/**
 * Format a period as a human-readable label.
 * No month → "2025"; with month → "June 2025" (using MONTH_NAMES).
 */
export function formatPeriodLabel(year: number, month?: number): string {
  if (month === undefined) return String(year);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
