import { describe, expect, test } from "bun:test";
import { parseCommentStatus } from "../../../src/lib/comments/status";

describe("parseCommentStatus", () => {
  test("valid statuses pass through", () => {
    expect(parseCommentStatus("pending")).toBe("pending");
    expect(parseCommentStatus("approved")).toBe("approved");
    expect(parseCommentStatus("spam")).toBe("spam");
  });

  test("trash passes through", () => {
    expect(parseCommentStatus("trash")).toBe("trash");
  });

  test("undefined / unknown / array => undefined (All)", () => {
    expect(parseCommentStatus(undefined)).toBeUndefined();
    expect(parseCommentStatus("all")).toBeUndefined();
    expect(parseCommentStatus("")).toBeUndefined();
    expect(parseCommentStatus("garbage")).toBeUndefined();
    expect(parseCommentStatus(["pending"] as unknown as string)).toBeUndefined();
  });
});
