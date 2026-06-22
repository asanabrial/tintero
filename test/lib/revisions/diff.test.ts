import { describe, expect, test } from "bun:test";
import { computeLineDiff } from "@/lib/revisions/diff";
import type { DiffLine } from "@/lib/revisions/diff";

// ============================================================
// computeLineDiff — LCS line-diff contract
// ============================================================

describe("computeLineDiff — identical inputs", () => {
  test("single line identical → all same", () => {
    const result = computeLineDiff("hello", "hello");
    expect(result).toEqual([{ kind: "same", text: "hello" }]);
  });

  test("multi-line identical → all same", () => {
    const result = computeLineDiff("a\nb\nc", "a\nb\nc");
    expect(result.every((l) => l.kind === "same")).toBe(true);
    expect(result.map((l) => l.text)).toEqual(["a", "b", "c"]);
  });

  test("no add or remove entries appear", () => {
    const result = computeLineDiff("x\ny", "x\ny");
    expect(result.some((l) => l.kind === "add" || l.kind === "remove")).toBe(false);
  });
});

describe("computeLineDiff — both empty", () => {
  test('("","") → []', () => {
    expect(computeLineDiff("", "")).toEqual([]);
  });
});

describe("computeLineDiff — pure add (empty old)", () => {
  test('("","line1\\nline2") → [{remove:""},{add:"line1"},{add:"line2"}]', () => {
    // "".split("\n") === [""], so old has one blank line, new has two real lines.
    // LCS between [""] and ["line1","line2"] is empty → remove "" + add line1 + add line2
    const result = computeLineDiff("", "line1\nline2");
    expect(result).toEqual([
      { kind: "remove", text: "" },
      { kind: "add", text: "line1" },
      { kind: "add", text: "line2" },
    ]);
  });

  test("all non-same entries are adds (except the leading blank remove)", () => {
    const result = computeLineDiff("", "a\nb");
    const adds = result.filter((l) => l.kind === "add");
    expect(adds.map((l) => l.text)).toEqual(["a", "b"]);
  });
});

describe("computeLineDiff — pure remove (empty new)", () => {
  test('("line1\\nline2","") → [{remove:"line1"},{remove:"line2"},{add:""}]', () => {
    // ["line1","line2"] vs [""] — LCS empty → remove line1 + remove line2 + add ""
    const result = computeLineDiff("line1\nline2", "");
    expect(result).toEqual([
      { kind: "remove", text: "line1" },
      { kind: "remove", text: "line2" },
      { kind: "add", text: "" },
    ]);
  });

  test("all non-same entries are removes (except the trailing blank add)", () => {
    const result = computeLineDiff("a\nb", "");
    const removes = result.filter((l) => l.kind === "remove");
    expect(removes.map((l) => l.text)).toEqual(["a", "b"]);
  });
});

describe("computeLineDiff — single line changed", () => {
  test('("hello","world") → [{remove:"hello"},{add:"world"}]', () => {
    const result = computeLineDiff("hello", "world");
    expect(result).toEqual([
      { kind: "remove", text: "hello" },
      { kind: "add", text: "world" },
    ]);
  });

  test("no same entries appear for a total single-line change", () => {
    const result = computeLineDiff("hello", "world");
    expect(result.some((l) => l.kind === "same")).toBe(false);
  });
});

describe("computeLineDiff — mixed change preserves unchanged lines", () => {
  test('("a\\nb\\nc","a\\nX\\nc") → same/remove/add/same', () => {
    const result = computeLineDiff("a\nb\nc", "a\nX\nc");
    expect(result).toEqual([
      { kind: "same", text: "a" },
      { kind: "remove", text: "b" },
      { kind: "add", text: "X" },
      { kind: "same", text: "c" },
    ]);
  });

  test('"a" and "c" appear as same entries', () => {
    const result = computeLineDiff("a\nb\nc", "a\nX\nc");
    const sameTexts = result.filter((l) => l.kind === "same").map((l) => l.text);
    expect(sameTexts).toContain("a");
    expect(sameTexts).toContain("c");
  });

  test('"b" appears as remove, "X" appears as add', () => {
    const result = computeLineDiff("a\nb\nc", "a\nX\nc");
    expect(result.some((l) => l.kind === "remove" && l.text === "b")).toBe(true);
    expect(result.some((l) => l.kind === "add" && l.text === "X")).toBe(true);
  });
});

describe("computeLineDiff — multiline block alignment", () => {
  test("shared lines stay same; extra new lines are add; missing old lines are remove", () => {
    const old = "header\nshared\nold-only\nfooter";
    const next = "header\nshared\nnew-only\nfooter";
    const result = computeLineDiff(old, next);
    const sameTexts = result.filter((l) => l.kind === "same").map((l) => l.text);
    expect(sameTexts).toContain("header");
    expect(sameTexts).toContain("shared");
    expect(sameTexts).toContain("footer");
    expect(result.some((l) => l.kind === "remove" && l.text === "old-only")).toBe(true);
    expect(result.some((l) => l.kind === "add" && l.text === "new-only")).toBe(true);
  });
});

describe("computeLineDiff — mid-insert order preserved", () => {
  test("inserting a line in the middle keeps surrounding same lines in order", () => {
    const old = "a\nc";
    const next = "a\nb\nc";
    const result = computeLineDiff(old, next);
    expect(result).toEqual([
      { kind: "same", text: "a" },
      { kind: "add", text: "b" },
      { kind: "same", text: "c" },
    ]);
  });

  test("result has correct kind sequence: same, add, same", () => {
    const result = computeLineDiff("a\nc", "a\nb\nc");
    expect(result.map((l) => l.kind)).toEqual(["same", "add", "same"]);
  });
});

describe("computeLineDiff — return type", () => {
  test("result is an array of DiffLine objects", () => {
    const result: DiffLine[] = computeLineDiff("x", "y");
    expect(Array.isArray(result)).toBe(true);
    for (const line of result) {
      expect(["same", "add", "remove"]).toContain(line.kind);
      expect(typeof line.text).toBe("string");
    }
  });
});
