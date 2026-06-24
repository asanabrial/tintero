import { describe, expect, test } from "bun:test";
import { gravatarUrl } from "../../../src/lib/avatar/gravatar";

describe("gravatarUrl", () => {
  test("normalizes email: trims and lowercases before hashing", () => {
    // Canonical Gravatar example: "MyEmailAddress@example.com " → MD5 "0bc83cb571cd1c50ba6f3e8a78ef1346"
    const url = gravatarUrl("MyEmailAddress@example.com ");
    expect(url).toContain("0bc83cb571cd1c50ba6f3e8a78ef1346");
  });

  test("returns correct Gravatar URL structure", () => {
    const url = gravatarUrl("test@example.com");
    expect(url).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{32}/);
  });

  test("default size is 80 and default d param is mp", () => {
    const url = gravatarUrl("test@example.com");
    expect(url).toContain("s=80");
    expect(url).toContain("d=mp");
  });

  test("respects custom size option", () => {
    const url = gravatarUrl("test@example.com", { size: 40 });
    expect(url).toContain("s=40");
  });

  test("respects custom default option", () => {
    const url = gravatarUrl("test@example.com", { default: "identicon" });
    expect(url).toContain("d=identicon");
  });
});
