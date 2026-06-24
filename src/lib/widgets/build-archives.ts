// Pure helper — no React, Next.js, or Date instantiation.
// Uses the same integer-parse convention as src/lib/content/archive.ts.

import { MONTH_NAMES, parseArchiveDate } from "@/lib/content/archive";

export type ArchiveBucket = {
  year: number;
  month: number;
  label: string;
  count: number;
  href: string;
};

/**
 * Group posts by year+month, attach a human-readable label and archive href,
 * and sort newest-first (year desc, month desc).
 *
 * Posts with unparseable dates are silently excluded.
 * Never uses new Date().
 */
export function buildArchiveBuckets(
  posts: Array<{ date: string }>
): ArchiveBucket[] {
  const map = new Map<string, { year: number; month: number; count: number }>();

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

  return Array.from(map.values())
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    })
    .map(({ year, month, count }) => ({
      year,
      month,
      count,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      href: `/blog/archive/${year}/${String(month).padStart(2, "0")}`,
    }));
}
