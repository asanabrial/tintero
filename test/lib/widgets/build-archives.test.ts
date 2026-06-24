import { describe, it, expect } from "bun:test";
import { buildArchiveBuckets } from "@/lib/widgets/build-archives";

describe("buildArchiveBuckets", () => {
  it("returns [] for empty input", () => {
    expect(buildArchiveBuckets([])).toEqual([]);
  });

  it("returns one bucket for a single post", () => {
    const result = buildArchiveBuckets([{ date: "2026-06-15" }]);
    expect(result).toHaveLength(1);
    expect(result[0].year).toBe(2026);
    expect(result[0].month).toBe(6);
    expect(result[0].count).toBe(1);
    expect(result[0].label).toBe("June 2026");
    expect(result[0].href).toBe("/blog/archive/2026/06");
  });

  it("counts multiple posts in the same year-month bucket", () => {
    const posts = [
      { date: "2026-06-01" },
      { date: "2026-06-15" },
      { date: "2026-06-30" },
    ];
    const result = buildArchiveBuckets(posts);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
  });

  it("sorts multiple months newest-first", () => {
    const posts = [
      { date: "2025-01-10" },
      { date: "2026-06-15" },
      { date: "2025-11-05" },
    ];
    const result = buildArchiveBuckets(posts);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ year: 2026, month: 6 });
    expect(result[1]).toMatchObject({ year: 2025, month: 11 });
    expect(result[2]).toMatchObject({ year: 2025, month: 1 });
  });

  it("zero-pads single-digit month in href", () => {
    const result = buildArchiveBuckets([{ date: "2026-03-20" }]);
    expect(result[0].href).toBe("/blog/archive/2026/03");
  });

  it("does NOT zero-pad double-digit month", () => {
    const result = buildArchiveBuckets([{ date: "2026-11-01" }]);
    expect(result[0].href).toBe("/blog/archive/2026/11");
  });

  it("formats label as 'Month YYYY'", () => {
    const months = [
      { date: "2026-01-01", label: "January 2026" },
      { date: "2026-02-01", label: "February 2026" },
      { date: "2026-03-01", label: "March 2026" },
      { date: "2026-04-01", label: "April 2026" },
      { date: "2026-05-01", label: "May 2026" },
      { date: "2026-06-01", label: "June 2026" },
      { date: "2026-07-01", label: "July 2026" },
      { date: "2026-08-01", label: "August 2026" },
      { date: "2026-09-01", label: "September 2026" },
      { date: "2026-10-01", label: "October 2026" },
      { date: "2026-11-01", label: "November 2026" },
      { date: "2026-12-01", label: "December 2026" },
    ];
    for (const { date, label } of months) {
      const result = buildArchiveBuckets([{ date }]);
      expect(result[0].label).toBe(label);
    }
  });

  it("sorts by year descending when posts span multiple years", () => {
    const posts = [
      { date: "2023-06-01" },
      { date: "2025-06-01" },
      { date: "2024-06-01" },
    ];
    const result = buildArchiveBuckets(posts);
    expect(result.map((b) => b.year)).toEqual([2025, 2024, 2023]);
  });

  it("excludes posts with malformed dates", () => {
    const posts = [
      { date: "2026-06-15" },
      { date: "not-a-date" },
      { date: "" },
    ];
    const result = buildArchiveBuckets(posts);
    expect(result).toHaveLength(1);
    expect(result[0].year).toBe(2026);
  });
});
