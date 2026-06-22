import { describe, expect, test, beforeEach } from "bun:test";
import { setupDb } from "./helpers";
import type { TestContext } from "./helpers";

// ============================================================
// WU-1 Adapter Tests (RED first — adapter not yet implemented)
// ============================================================

let ctx: TestContext;

beforeEach(async () => {
  ctx = await setupDb();
});

const SAMPLE_INPUT = {
  contentType: "post" as const,
  slug: "hello-world",
  rawContent: "---\ntitle: Hello World\n---\nBody content",
  source: "admin" as const,
  authorId: "u1",
  authorLabel: "alice@example.com",
};

describe("DrizzleRevisionAdapter.record", () => {
  test("returns a row with non-null uuid id", async () => {
    const rev = await ctx.adapter.record(SAMPLE_INPUT);
    expect(rev.id).toBeTruthy();
    expect(typeof rev.id).toBe("string");
  });

  test("returns a row with positive integer sequence", async () => {
    const rev = await ctx.adapter.record(SAMPLE_INPUT);
    expect(typeof rev.sequence).toBe("number");
    expect(rev.sequence).toBeGreaterThan(0);
  });

  test("returns a row with a createdAt timestamp", async () => {
    const rev = await ctx.adapter.record(SAMPLE_INPUT);
    expect(rev.createdAt).toBeInstanceOf(Date);
  });

  test("returns a row with the correct input fields", async () => {
    const rev = await ctx.adapter.record(SAMPLE_INPUT);
    expect(rev.contentType).toBe("post");
    expect(rev.slug).toBe("hello-world");
    expect(rev.rawContent).toBe(SAMPLE_INPUT.rawContent);
    expect(rev.source).toBe("admin");
    expect(rev.authorId).toBe("u1");
    expect(rev.authorLabel).toBe("alice@example.com");
  });
});

describe("DrizzleRevisionAdapter.getById", () => {
  test("retrieves the row just recorded", async () => {
    const inserted = await ctx.adapter.record(SAMPLE_INPUT);
    const found = await ctx.adapter.getById(inserted.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(inserted.id);
    expect(found!.slug).toBe(inserted.slug);
  });

  test("returns null for unknown id", async () => {
    const result = await ctx.adapter.getById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("DrizzleRevisionAdapter.listForSlug", () => {
  test("returns revisions newest-first (createdAt desc)", async () => {
    // Insert two revisions with a small delay to ensure distinct timestamps
    const first = await ctx.adapter.record(SAMPLE_INPUT);
    // Force different sequence/time by awaiting a tick
    await new Promise((r) => setTimeout(r, 5));
    const second = await ctx.adapter.record({
      ...SAMPLE_INPUT,
      rawContent: "---\ntitle: Hello World v2\n---\nUpdated body",
    });

    const revs = await ctx.adapter.listForSlug("post", "hello-world");
    expect(revs.length).toBeGreaterThanOrEqual(2);
    // Newest first: second should appear before first
    const firstIdx = revs.findIndex((r) => r.id === first.id);
    const secondIdx = revs.findIndex((r) => r.id === second.id);
    expect(secondIdx).toBeLessThan(firstIdx);
  });

  test("filters by contentType AND slug — excludes other slugs", async () => {
    await ctx.adapter.record(SAMPLE_INPUT);
    await ctx.adapter.record({
      contentType: "post",
      slug: "other-slug",
      rawContent: "---\ntitle: Other\n---\nOther body",
      source: "admin",
      authorId: null,
      authorLabel: null,
    });

    const revs = await ctx.adapter.listForSlug("post", "hello-world");
    expect(revs.every((r) => r.slug === "hello-world")).toBe(true);
  });

  test("filters by contentType AND slug — excludes other contentTypes", async () => {
    await ctx.adapter.record(SAMPLE_INPUT);
    await ctx.adapter.record({
      contentType: "page",
      slug: "hello-world",
      rawContent: "---\ntitle: Hello Page\n---\nPage body",
      source: "admin",
      authorId: null,
      authorLabel: null,
    });

    const revs = await ctx.adapter.listForSlug("post", "hello-world");
    expect(revs.every((r) => r.contentType === "post")).toBe(true);
  });

  test("returns empty array when no revisions exist for slug", async () => {
    const revs = await ctx.adapter.listForSlug("post", "nonexistent");
    expect(revs).toEqual([]);
  });
});

describe("DrizzleRevisionAdapter — sequence monotonicity", () => {
  test("sequence is strictly monotonic for three consecutive inserts on same slug", async () => {
    const r1 = await ctx.adapter.record(SAMPLE_INPUT);
    const r2 = await ctx.adapter.record(SAMPLE_INPUT);
    const r3 = await ctx.adapter.record(SAMPLE_INPUT);

    expect(r2.sequence).toBeGreaterThan(r1.sequence);
    expect(r3.sequence).toBeGreaterThan(r2.sequence);
  });
});

describe("DrizzleRevisionAdapter — deleted-user revisions survive", () => {
  test("row with authorId='deleted-user' still returned when user table has no such row", async () => {
    // No users table in this schema — revisions are intentionally FK-free.
    // This test verifies the insert works with an arbitrary authorId.
    const rev = await ctx.adapter.record({
      contentType: "post",
      slug: "orphan-post",
      rawContent: "---\ntitle: Orphan\n---\nBody",
      source: "admin",
      authorId: "deleted-user",
      authorLabel: "former@example.com",
    });

    const found = await ctx.adapter.getById(rev.id);
    expect(found).not.toBeNull();
    expect(found!.authorId).toBe("deleted-user");

    const list = await ctx.adapter.listForSlug("post", "orphan-post");
    expect(list.length).toBe(1);
    expect(list[0]!.authorId).toBe("deleted-user");
  });
});
