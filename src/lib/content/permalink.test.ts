import { describe, expect, it } from "bun:test";
import {
  PERMALINK_STRUCTURES,
  postPath,
  permalinkSlug,
  isPermalinkStructure,
  type PermalinkStructure,
} from "./permalink";

// Minimal post shape the helper needs (date + slug).
function post(slug: string, date: string) {
  return { slug, date };
}

describe("postPath", () => {
  it("plain structure returns /blog/{slug}", () => {
    expect(postPath(post("hello-world", "2026-06-22"), "plain")).toBe(
      "/blog/hello-world"
    );
  });

  it("month-and-name returns /blog/{YYYY}/{MM}/{slug}", () => {
    expect(postPath(post("hello-world", "2026-06-22"), "month-and-name")).toBe(
      "/blog/2026/06/hello-world"
    );
  });

  it("day-and-name returns /blog/{YYYY}/{MM}/{DD}/{slug}", () => {
    expect(postPath(post("hello-world", "2026-06-22"), "day-and-name")).toBe(
      "/blog/2026/06/22/hello-world"
    );
  });

  it("zero-pads single-digit month and day", () => {
    expect(postPath(post("x", "2026-01-05"), "day-and-name")).toBe(
      "/blog/2026/01/05/x"
    );
  });

  it("reads only the date portion when date includes a time component", () => {
    expect(postPath(post("x", "2026-12-09T14:30:00Z"), "month-and-name")).toBe(
      "/blog/2026/12/x"
    );
  });

  it("falls back to plain when the date is missing or malformed", () => {
    expect(postPath(post("x", ""), "day-and-name")).toBe("/blog/x");
    expect(postPath(post("x", "not-a-date"), "month-and-name")).toBe("/blog/x");
  });

  it("defaults to plain for an unknown structure", () => {
    expect(postPath(post("x", "2026-06-22"), "bogus" as PermalinkStructure)).toBe(
      "/blog/x"
    );
  });
});

describe("permalinkSlug", () => {
  it("returns the last path segment regardless of structure", () => {
    expect(permalinkSlug(["hello-world"])).toBe("hello-world");
    expect(permalinkSlug(["2026", "06", "hello-world"])).toBe("hello-world");
    expect(permalinkSlug(["2026", "06", "22", "hello-world"])).toBe(
      "hello-world"
    );
  });

  it("returns null for empty segments", () => {
    expect(permalinkSlug([])).toBeNull();
  });

  it("ignores empty trailing segments (trailing slash)", () => {
    expect(permalinkSlug(["2026", "06", "hello-world", ""])).toBe("hello-world");
  });
});

describe("isPermalinkStructure", () => {
  it("accepts every known structure", () => {
    for (const s of PERMALINK_STRUCTURES) {
      expect(isPermalinkStructure(s)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isPermalinkStructure("numeric")).toBe(false);
    expect(isPermalinkStructure("")).toBe(false);
    expect(isPermalinkStructure(undefined)).toBe(false);
  });
});
