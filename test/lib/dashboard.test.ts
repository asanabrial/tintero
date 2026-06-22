import { describe, expect, test } from "bun:test";
import { splitPostsByStatus } from "../../src/lib/content/dashboard";

// Inline minimal Post fixtures — 'status' and 'date' fields are read by splitPostsByStatus.
type MinimalPost = { status: string; date: string };

const NOW = "2026-06-13";
const PAST = "2026-06-12";
const FUTURE = "2026-06-14";
const TODAY = "2026-06-13"; // same as NOW — boundary

describe("splitPostsByStatus", () => {
  test("mixed statuses: 3 published (past) + 2 draft + 1 archived → { published: 3, draft: 2, scheduled: 0 }", () => {
    const posts: MinimalPost[] = [
      { status: "published", date: PAST },
      { status: "published", date: PAST },
      { status: "published", date: PAST },
      { status: "draft", date: PAST },
      { status: "draft", date: PAST },
      { status: "archived", date: PAST },
    ];
    expect(splitPostsByStatus(posts as never, NOW)).toEqual({ published: 3, draft: 2, scheduled: 0 });
  });

  test("all published past (4) → { published: 4, draft: 0, scheduled: 0 }", () => {
    const posts: MinimalPost[] = [
      { status: "published", date: PAST },
      { status: "published", date: PAST },
      { status: "published", date: PAST },
      { status: "published", date: PAST },
    ];
    expect(splitPostsByStatus(posts as never, NOW)).toEqual({ published: 4, draft: 0, scheduled: 0 });
  });

  test("all draft (3) → { published: 0, draft: 3, scheduled: 0 }", () => {
    const posts: MinimalPost[] = [
      { status: "draft", date: PAST },
      { status: "draft", date: PAST },
      { status: "draft", date: PAST },
    ];
    expect(splitPostsByStatus(posts as never, NOW)).toEqual({ published: 0, draft: 3, scheduled: 0 });
  });

  test("empty array → { published: 0, draft: 0, scheduled: 0 }", () => {
    expect(splitPostsByStatus([], NOW)).toEqual({ published: 0, draft: 0, scheduled: 0 });
  });

  test("unknown/other statuses only → { published: 0, draft: 0, scheduled: 0 }", () => {
    const posts: MinimalPost[] = [
      { status: "archived", date: PAST },
      { status: "scheduled", date: PAST },
    ];
    expect(splitPostsByStatus(posts as never, NOW)).toEqual({ published: 0, draft: 0, scheduled: 0 });
  });

  // --- NEW: scheduled-related cases ---

  test("published + future date → counted as scheduled, NOT published", () => {
    const posts: MinimalPost[] = [
      { status: "published", date: FUTURE },
    ];
    expect(splitPostsByStatus(posts as never, NOW)).toEqual({ published: 0, draft: 0, scheduled: 1 });
  });

  test("published + today (date === now) → counted as published, NOT scheduled (boundary)", () => {
    const posts: MinimalPost[] = [
      { status: "published", date: TODAY },
    ];
    expect(splitPostsByStatus(posts as never, NOW)).toEqual({ published: 1, draft: 0, scheduled: 0 });
  });

  test("draft with future date → counted as draft only (not scheduled)", () => {
    const posts: MinimalPost[] = [
      { status: "draft", date: FUTURE },
    ];
    expect(splitPostsByStatus(posts as never, NOW)).toEqual({ published: 0, draft: 1, scheduled: 0 });
  });

  test("mixed: 2 published past + 1 published future + 1 draft → { published: 2, draft: 1, scheduled: 1 }", () => {
    const posts: MinimalPost[] = [
      { status: "published", date: PAST },
      { status: "published", date: PAST },
      { status: "published", date: FUTURE },
      { status: "draft", date: PAST },
    ];
    expect(splitPostsByStatus(posts as never, NOW)).toEqual({ published: 2, draft: 1, scheduled: 1 });
  });

  test("multiple scheduled posts counted correctly", () => {
    const posts: MinimalPost[] = [
      { status: "published", date: FUTURE },
      { status: "published", date: FUTURE },
      { status: "published", date: FUTURE },
    ];
    expect(splitPostsByStatus(posts as never, NOW)).toEqual({ published: 0, draft: 0, scheduled: 3 });
  });

  test("a scheduled and a published post are mutually exclusive (no double-counting)", () => {
    const posts: MinimalPost[] = [
      { status: "published", date: PAST },
      { status: "published", date: FUTURE },
    ];
    const result = splitPostsByStatus(posts as never, NOW);
    expect(result.published + result.scheduled).toBe(2);
    expect(result.published).toBe(1);
    expect(result.scheduled).toBe(1);
  });
});
