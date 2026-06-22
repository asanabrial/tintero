import { describe, it, expect } from "bun:test";
import { parseSelectedUserIds } from "./parse-selected-user-ids";

function makeFormData(ids: string[]): FormData {
  const fd = new FormData();
  for (const id of ids) {
    fd.append("userId", id);
  }
  return fd;
}

describe("parseSelectedUserIds", () => {
  it("returns [] for empty FormData (no userId entries)", () => {
    const fd = new FormData();
    expect(parseSelectedUserIds(fd)).toEqual([]);
  });

  it("returns all three ids for a clean three-entry FormData", () => {
    expect(parseSelectedUserIds(makeFormData(["a", "b", "c"]))).toEqual(["a", "b", "c"]);
  });

  it("trims and drops empty/whitespace-only entries", () => {
    expect(parseSelectedUserIds(makeFormData(["", "  ", "a"]))).toEqual(["a"]);
  });

  it("trims whitespace-padded ids", () => {
    expect(parseSelectedUserIds(makeFormData(["  a  ", "b"]))).toEqual(["a", "b"]);
  });

  it("deduplicates, keeping first-seen order", () => {
    expect(parseSelectedUserIds(makeFormData(["a", "a", "b"]))).toEqual(["a", "b"]);
  });

  it("preserves insertion order for distinct ids", () => {
    expect(parseSelectedUserIds(makeFormData(["b", "a"]))).toEqual(["b", "a"]);
  });
});
