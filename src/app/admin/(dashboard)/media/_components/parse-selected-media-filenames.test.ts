import { describe, it, expect } from "bun:test";
import { parseSelectedMediaFilenames } from "./parse-selected-media-filenames";

function makeFormData(filenames: string[]): FormData {
  const fd = new FormData();
  for (const f of filenames) {
    fd.append("filename", f);
  }
  return fd;
}

describe("parseSelectedMediaFilenames", () => {
  it("returns [] for empty FormData (no filename entries)", () => {
    const fd = new FormData();
    expect(parseSelectedMediaFilenames(fd)).toEqual([]);
  });

  it("returns all three filenames for a clean three-entry FormData", () => {
    expect(
      parseSelectedMediaFilenames(makeFormData(["a.jpg", "b.png", "c.gif"]))
    ).toEqual(["a.jpg", "b.png", "c.gif"]);
  });

  it("trims and drops empty/whitespace-only entries", () => {
    expect(
      parseSelectedMediaFilenames(makeFormData(["", "  ", "a.jpg"]))
    ).toEqual(["a.jpg"]);
  });

  it("trims whitespace-padded filenames", () => {
    expect(
      parseSelectedMediaFilenames(makeFormData(["  a.jpg  ", "b.png"]))
    ).toEqual(["a.jpg", "b.png"]);
  });

  it("deduplicates, keeping first-seen order", () => {
    expect(
      parseSelectedMediaFilenames(makeFormData(["a.jpg", "a.jpg", "b.png"]))
    ).toEqual(["a.jpg", "b.png"]);
  });

  it("preserves insertion order for distinct filenames", () => {
    expect(
      parseSelectedMediaFilenames(makeFormData(["b.png", "a.jpg"]))
    ).toEqual(["b.png", "a.jpg"]);
  });
});
