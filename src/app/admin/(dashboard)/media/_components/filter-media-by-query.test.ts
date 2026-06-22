import { describe, it, expect } from "bun:test";
import { filterMediaByQuery } from "./filter-media-by-query";
import type { MediaAsset } from "@/lib/media/types";

function makeAsset(filename: string): MediaAsset {
  return { filename, size: 0, url: `/uploads/${filename}` };
}

const photo = makeAsset("photo.png");
const doc = makeAsset("doc.pdf");
const report = makeAsset("report-2024.pdf");
const summary = makeAsset("summary.pdf");
const imgUpper = makeAsset("IMG_2020.JPG");
describe("filterMediaByQuery", () => {
  it("empty q returns all assets", () => {
    const items = [photo, doc];
    expect(filterMediaByQuery(items, "")).toEqual(items);
  });

  it("whitespace-only q returns all assets", () => {
    const items = [photo, doc];
    expect(filterMediaByQuery(items, "   ")).toEqual(items);
  });

  it("lowercase needle hits lowercase filename", () => {
    const items = [photo, doc];
    expect(filterMediaByQuery(items, "photo")).toEqual([photo]);
  });

  it("uppercase query matches lowercase filename (case-insensitive)", () => {
    const items = [photo, doc];
    expect(filterMediaByQuery(items, "PHOTO")).toEqual([photo]);
  });

  it("lowercase query matches uppercase filename (case-insensitive)", () => {
    const items = [imgUpper];
    expect(filterMediaByQuery(items, "img")).toEqual([imgUpper]);
  });

  it("partial substring match in the middle of a filename", () => {
    const items = [report, summary, photo];
    expect(filterMediaByQuery(items, "pdf")).toEqual([report, summary]);
  });

  it("no match returns empty array", () => {
    const items = [photo, doc];
    expect(filterMediaByQuery(items, "xyzzy")).toEqual([]);
  });
});
