import { describe, test, expect } from "bun:test";
import { previewStatusLabel } from "@/lib/content/preview";

describe("previewStatusLabel", () => {
  test("returns 'Draft' for draft status", () => {
    expect(previewStatusLabel("draft")).toBe("Draft");
  });
  test("returns 'Published' for published status", () => {
    expect(previewStatusLabel("published")).toBe("Published");
  });
  test("returns 'Scheduled' for scheduled/future status", () => {
    expect(previewStatusLabel("scheduled")).toBe("Scheduled");
  });
  test("returns the raw value for unknown status", () => {
    expect(previewStatusLabel("other")).toBe("other");
  });
});
