import { describe, it, expect } from "bun:test";
import { parseSelectedSlugs } from "./parse-selected-slugs";

function makeFormData(slugs: string[]): FormData {
  const fd = new FormData();
  for (const s of slugs) {
    fd.append("slug", s);
  }
  return fd;
}

describe("parseSelectedSlugs", () => {
  it("returns [] for empty FormData (no slug entries)", () => {
    const fd = new FormData();
    expect(parseSelectedSlugs(fd)).toEqual([]);
  });

  it("returns all three slugs for a clean three-entry FormData", () => {
    expect(parseSelectedSlugs(makeFormData(["a", "b", "c"]))).toEqual(["a", "b", "c"]);
  });

  it("trims and drops empty/whitespace-only entries", () => {
    expect(parseSelectedSlugs(makeFormData(["", "  ", "a"]))).toEqual(["a"]);
  });

  it("trims whitespace-padded slugs", () => {
    expect(parseSelectedSlugs(makeFormData(["  a  ", "b"]))).toEqual(["a", "b"]);
  });

  it("deduplicates, keeping first-seen order", () => {
    expect(parseSelectedSlugs(makeFormData(["a", "a", "b"]))).toEqual(["a", "b"]);
  });

  it("preserves insertion order for distinct slugs", () => {
    expect(parseSelectedSlugs(makeFormData(["b", "a"]))).toEqual(["b", "a"]);
  });
});
