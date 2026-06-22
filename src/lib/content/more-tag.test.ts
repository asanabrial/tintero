import { describe, it, expect } from "bun:test";
import { splitMore } from "./more-tag";

describe("splitMore", () => {
  it("splits on <!--more--> and returns teaser + hasMore=true", () => {
    const body = "Before the fold.\n\n<!--more-->\n\nAfter the fold.";
    const { teaser, hasMore } = splitMore(body);
    expect(hasMore).toBe(true);
    expect(teaser).toBe("Before the fold.\n\n");
  });

  it("is tolerant of spaces inside the marker (<!-- more -->)", () => {
    const body = "Intro text.\n\n<!-- more -->\n\nRest of post.";
    const { teaser, hasMore } = splitMore(body);
    expect(hasMore).toBe(true);
    expect(teaser).toBe("Intro text.\n\n");
  });

  it("is case-insensitive (<!-- MORE -->)", () => {
    const body = "Intro.\n\n<!-- MORE -->\n\nRest.";
    const { teaser, hasMore } = splitMore(body);
    expect(hasMore).toBe(true);
    expect(teaser).toBe("Intro.\n\n");
  });

  it("returns full body and hasMore=false when no marker present", () => {
    const body = "This post has no more tag at all.";
    const { teaser, hasMore } = splitMore(body);
    expect(hasMore).toBe(false);
    expect(teaser).toBe(body);
  });

  it("returns empty teaser and hasMore=true when marker is at start", () => {
    const body = "<!--more-->\n\nEverything is after.";
    const { teaser, hasMore } = splitMore(body);
    expect(hasMore).toBe(true);
    expect(teaser).toBe("");
  });

  it("returns teaser = full body before marker when marker is at end", () => {
    const body = "Everything is before.<!--more-->";
    const { teaser, hasMore } = splitMore(body);
    expect(hasMore).toBe(true);
    expect(teaser).toBe("Everything is before.");
  });

  it("splits only on the FIRST marker when multiple markers are present", () => {
    const body = "First.\n\n<!--more-->\n\nSecond.\n\n<!--more-->\n\nThird.";
    const { teaser, hasMore } = splitMore(body);
    expect(hasMore).toBe(true);
    expect(teaser).toBe("First.\n\n");
  });

  it("handles extra whitespace variants like <!--  more  -->", () => {
    const body = "Lead.\n\n<!--  more  -->\n\nTrail.";
    const { teaser, hasMore } = splitMore(body);
    expect(hasMore).toBe(true);
    expect(teaser).toBe("Lead.\n\n");
  });
});
