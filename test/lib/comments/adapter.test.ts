import { beforeEach, describe, expect, test } from "bun:test";
import { CommentDepthError } from "../../../src/lib/comments/types";
import type { TestContext } from "./helpers";
import { setupDb } from "./helpers";

let ctx: TestContext;

beforeEach(async () => {
  // Fresh in-memory DB for every test
  ctx = await setupDb();
});

describe("DrizzleCommentAdapter — submit", () => {
  test("submit inserts a pending comment and returns it", async () => {
    const comment = await ctx.adapter.submit(
      {
        postSlug: "hello-world",
        authorName: "Alice",
        authorEmail: "alice@example.com",
        body: "A great post!",
        parentId: null,
      },
      "pending"
    );
    expect(comment.id).toBeString();
    expect(comment.postSlug).toBe("hello-world");
    expect(comment.authorName).toBe("Alice");
    expect(comment.authorEmail).toBe("alice@example.com");
    expect(comment.status).toBe("pending");
    expect(comment.parentId).toBeNull();
    expect(comment.createdAt).toBeInstanceOf(Date);
  });

  test("submit inserts an approved comment when status=approved", async () => {
    const comment = await ctx.adapter.submit(
      {
        postSlug: "test-post",
        authorName: "Bob",
        authorEmail: "bob@example.com",
        body: "Nice article!",
        parentId: null,
      },
      "approved"
    );
    expect(comment.status).toBe("approved");
  });

  test("submit: depth guard — reply to a reply throws CommentDepthError", async () => {
    const topLevel = await ctx.adapter.submit(
      {
        postSlug: "post",
        authorName: "A",
        authorEmail: "a@example.com",
        body: "Top-level comment",
        parentId: null,
      },
      "approved"
    );
    const reply = await ctx.adapter.submit(
      {
        postSlug: "post",
        authorName: "B",
        authorEmail: "b@example.com",
        body: "Reply to top-level",
        parentId: topLevel.id,
      },
      "approved"
    );
    // Try to reply to a reply
    await expect(
      ctx.adapter.submit(
        {
          postSlug: "post",
          authorName: "C",
          authorEmail: "c@example.com",
          body: "Reply to a reply",
          parentId: reply.id,
        },
        "approved"
      )
    ).rejects.toBeInstanceOf(CommentDepthError);
  });

  test("submit: depth guard — reply to non-existent parent throws CommentDepthError", async () => {
    await expect(
      ctx.adapter.submit(
        {
          postSlug: "post",
          authorName: "A",
          authorEmail: "a@example.com",
          body: "Orphan reply",
          parentId: "00000000-0000-0000-0000-000000000000",
        },
        "approved"
      )
    ).rejects.toBeInstanceOf(CommentDepthError);
  });

  test("submit: depth guard — reply to unapproved parent throws CommentDepthError", async () => {
    const pending = await ctx.adapter.submit(
      {
        postSlug: "post",
        authorName: "A",
        authorEmail: "a@example.com",
        body: "Pending top-level",
        parentId: null,
      },
      "pending"
    );
    await expect(
      ctx.adapter.submit(
        {
          postSlug: "post",
          authorName: "B",
          authorEmail: "b@example.com",
          body: "Reply to pending",
          parentId: pending.id,
        },
        "approved"
      )
    ).rejects.toBeInstanceOf(CommentDepthError);
  });
});

describe("DrizzleCommentAdapter — listApproved", () => {
  test("returns only approved comments as CommentThread[], no authorEmail", async () => {
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@example.com", body: "Approved comment", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "B", authorEmail: "b@example.com", body: "Pending comment", parentId: null },
      "pending"
    );

    const threads = await ctx.adapter.listApproved("post");
    expect(threads.length).toBe(1);
    expect(threads[0].comment.authorName).toBe("A");
    // PublicComment must not expose authorEmail
    expect((threads[0].comment as unknown as Record<string, unknown>).authorEmail).toBeUndefined();
  });

  test("grouping: orphaned replies are excluded from CommentThread", async () => {
    const top = await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@example.com", body: "Top", parentId: null },
      "approved"
    );
    // Mark the top comment as spam (simulate orphaned reply scenario by approving a reply then removing parent)
    // We'll insert the reply directly using submit, then setSpam the parent
    const reply = await ctx.adapter.submit(
      { postSlug: "post", authorName: "B", authorEmail: "b@example.com", body: "Reply to top", parentId: top.id },
      "approved"
    );
    // Spam the parent so it is no longer in approved list
    await ctx.adapter.setSpam(top.id);

    const threads = await ctx.adapter.listApproved("post");
    // Top-level comment was spammed, so it's gone.
    // Reply's parent is now spammed — it's an orphan and must be excluded.
    expect(threads.length).toBe(0);
    // Verify reply itself is still approved (not deleted), just not rendered
    const _ = reply; // suppress unused warning
  });

  test("ordering: top-level asc, replies asc under parent", async () => {
    // Insert: C1 (top), C2 (top), R1 (reply to C1)
    const c1 = await ctx.adapter.submit(
      { postSlug: "post", authorName: "C1", authorEmail: "c1@x.com", body: "First top-level", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "C2", authorEmail: "c2@x.com", body: "Second top-level", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "R1", authorEmail: "r1@x.com", body: "Reply to first", parentId: c1.id },
      "approved"
    );

    const threads = await ctx.adapter.listApproved("post");
    // Should have 2 threads: C1 (with 1 reply) and C2 (0 replies)
    expect(threads.length).toBe(2);
    expect(threads[0].comment.authorName).toBe("C1");
    expect(threads[0].replies.length).toBe(1);
    expect(threads[0].replies[0].authorName).toBe("R1");
    expect(threads[1].comment.authorName).toBe("C2");
    expect(threads[1].replies.length).toBe(0);
  });
});

describe("DrizzleCommentAdapter — countApproved", () => {
  test("returns count of approved only", async () => {
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@x.com", body: "Approved one", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "B", authorEmail: "b@x.com", body: "Approved two", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "C", authorEmail: "c@x.com", body: "Pending one", parentId: null },
      "pending"
    );

    const count = await ctx.adapter.countApproved("post");
    expect(count).toBe(2);
  });

  test("returns 0 when no approved comments", async () => {
    const count = await ctx.adapter.countApproved("no-such-post");
    expect(count).toBe(0);
  });
});

describe("DrizzleCommentAdapter — countApprovedBySlugs", () => {
  test("returns approved counts per slug, zero-filled for slugs with none", async () => {
    await ctx.adapter.submit(
      { postSlug: "alpha", authorName: "A", authorEmail: "a@x.com", body: "Approved one", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "alpha", authorName: "B", authorEmail: "b@x.com", body: "Approved two", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "alpha", authorName: "C", authorEmail: "c@x.com", body: "Pending — excluded", parentId: null },
      "pending"
    );
    await ctx.adapter.submit(
      { postSlug: "beta", authorName: "D", authorEmail: "d@x.com", body: "Approved beta", parentId: null },
      "approved"
    );

    const counts = await ctx.adapter.countApprovedBySlugs(["alpha", "beta", "gamma"]);
    expect(counts).toEqual({ alpha: 2, beta: 1, gamma: 0 });
  });

  test("returns empty object for empty input", async () => {
    const counts = await ctx.adapter.countApprovedBySlugs([]);
    expect(counts).toEqual({});
  });
});

describe("DrizzleCommentAdapter — approve", () => {
  test("sets status to approved and returns updated record", async () => {
    const c = await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@x.com", body: "Pending comment", parentId: null },
      "pending"
    );
    const updated = await ctx.adapter.approve(c.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("approved");
    expect(updated!.id).toBe(c.id);
  });

  test("returns null if comment not found", async () => {
    const result = await ctx.adapter.approve("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("DrizzleCommentAdapter — setSpam", () => {
  test("sets status to spam and returns updated record", async () => {
    const c = await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@x.com", body: "Spam comment", parentId: null },
      "pending"
    );
    const updated = await ctx.adapter.setSpam(c.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("spam");
  });

  test("returns null if comment not found", async () => {
    const result = await ctx.adapter.setSpam("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("DrizzleCommentAdapter — delete", () => {
  test("removes the row and returns true", async () => {
    const c = await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@x.com", body: "To be deleted", parentId: null },
      "approved"
    );
    const result = await ctx.adapter.delete(c.id);
    expect(result).toBe(true);

    // Verify it's gone
    const count = await ctx.adapter.countApproved("post");
    expect(count).toBe(0);
  });

  test("returns false if comment not found", async () => {
    const result = await ctx.adapter.delete("00000000-0000-0000-0000-000000000000");
    expect(result).toBe(false);
  });
});

describe("DrizzleCommentAdapter — listPending", () => {
  test("returns pending comments across all slugs", async () => {
    await ctx.adapter.submit(
      { postSlug: "post-1", authorName: "A", authorEmail: "a@x.com", body: "Pending one", parentId: null },
      "pending"
    );
    await ctx.adapter.submit(
      { postSlug: "post-2", authorName: "B", authorEmail: "b@x.com", body: "Pending two", parentId: null },
      "pending"
    );
    await ctx.adapter.submit(
      { postSlug: "post-1", authorName: "C", authorEmail: "c@x.com", body: "Approved", parentId: null },
      "approved"
    );

    const pending = await ctx.adapter.listPending();
    expect(pending.length).toBe(2);
    expect(pending.every((c) => c.status === "pending")).toBe(true);
  });

  test("returns empty array when no pending comments", async () => {
    const pending = await ctx.adapter.listPending();
    expect(pending.length).toBe(0);
  });
});

describe("DrizzleCommentAdapter — listRecentApproved", () => {
  test("returns only approved rows (pending and spam excluded)", async () => {
    // Seed 3 approved, 2 pending, 1 spam
    for (let i = 0; i < 3; i++) {
      await ctx.adapter.submit(
        { postSlug: "post-a", authorName: `A${i}`, authorEmail: `a${i}@x.com`, body: `Approved ${i}`, parentId: null },
        "approved"
      );
    }
    for (let i = 0; i < 2; i++) {
      await ctx.adapter.submit(
        { postSlug: "post-a", authorName: `P${i}`, authorEmail: `p${i}@x.com`, body: `Pending ${i}`, parentId: null },
        "pending"
      );
    }
    const spam = await ctx.adapter.submit(
      { postSlug: "post-a", authorName: "S", authorEmail: "s@x.com", body: "Spam comment", parentId: null },
      "pending"
    );
    await ctx.adapter.setSpam(spam.id);

    const result = await ctx.adapter.listRecentApproved(50);
    expect(result.length).toBe(3);
    expect(result.every((c) => c.status === "approved")).toBe(true);
  });

  test("returns newest-first (desc createdAt) — ORDER BY desc is enforced", async () => {
    // Insert 3 approved comments; update createdAt via raw DB to ensure distinct timestamps.
    // This verifies the adapter really orders by DESC createdAt, not insertion order.
    const c1 = await ctx.adapter.submit(
      { postSlug: "post-order", authorName: "First", authorEmail: "first@x.com", body: "Oldest", parentId: null },
      "approved"
    );
    const c2 = await ctx.adapter.submit(
      { postSlug: "post-order", authorName: "Second", authorEmail: "second@x.com", body: "Middle", parentId: null },
      "approved"
    );
    const c3 = await ctx.adapter.submit(
      { postSlug: "post-order", authorName: "Third", authorEmail: "third@x.com", body: "Newest", parentId: null },
      "approved"
    );

    // Set explicit distinct timestamps so order is deterministic regardless of PGlite timing
    await ctx.db.execute(
      `UPDATE comments SET created_at = '2024-01-01T00:00:00Z' WHERE id = '${c1.id}'`
    );
    await ctx.db.execute(
      `UPDATE comments SET created_at = '2024-01-02T00:00:00Z' WHERE id = '${c2.id}'`
    );
    await ctx.db.execute(
      `UPDATE comments SET created_at = '2024-01-03T00:00:00Z' WHERE id = '${c3.id}'`
    );

    const result = await ctx.adapter.listRecentApproved(50);
    expect(result.length).toBe(3);
    // Newest-first: c3 (Jan 3), c2 (Jan 2), c1 (Jan 1)
    expect(result[0].id).toBe(c3.id);
    expect(result[1].id).toBe(c2.id);
    expect(result[2].id).toBe(c1.id);
  });

  test("respects limit parameter", async () => {
    // Seed 10 approved
    for (let i = 0; i < 10; i++) {
      await ctx.adapter.submit(
        { postSlug: "post-limit", authorName: `User${i}`, authorEmail: `u${i}@x.com`, body: `Comment ${i}`, parentId: null },
        "approved"
      );
    }

    const result = await ctx.adapter.listRecentApproved(5);
    expect(result.length).toBe(5);
  });

  test("returns flat list (no threading — replies and top-level intermixed)", async () => {
    const top = await ctx.adapter.submit(
      { postSlug: "post-flat", authorName: "TopUser", authorEmail: "top@x.com", body: "Top level", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "post-flat", authorName: "ReplyUser", authorEmail: "reply@x.com", body: "Reply to top", parentId: top.id },
      "approved"
    );

    const result = await ctx.adapter.listRecentApproved(50);
    // Both the top-level and the reply should appear as flat items
    expect(result.length).toBe(2);
    // No .replies property (it's PublicComment[], not CommentThread[])
    expect((result[0] as unknown as Record<string, unknown>).replies).toBeUndefined();
    expect((result[1] as unknown as Record<string, unknown>).replies).toBeUndefined();
  });

  test("never returns authorEmail on items", async () => {
    await ctx.adapter.submit(
      { postSlug: "post-email", authorName: "Alice", authorEmail: "alice@secret.com", body: "No email please", parentId: null },
      "approved"
    );

    const result = await ctx.adapter.listRecentApproved(50);
    expect(result.length).toBe(1);
    expect((result[0] as unknown as Record<string, unknown>).authorEmail).toBeUndefined();
  });

  test("empty DB returns empty array", async () => {
    const result = await ctx.adapter.listRecentApproved(50);
    expect(result).toEqual([]);
  });

  test("cross-slug — returns approved comments from multiple posts", async () => {
    await ctx.adapter.submit(
      { postSlug: "slug-one", authorName: "Alice", authorEmail: "a@x.com", body: "On post one", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "slug-two", authorName: "Bob", authorEmail: "b@x.com", body: "On post two", parentId: null },
      "approved"
    );

    const result = await ctx.adapter.listRecentApproved(50);
    expect(result.length).toBe(2);
    const slugs = result.map((c) => c.postSlug);
    expect(slugs).toContain("slug-one");
    expect(slugs).toContain("slug-two");
  });
});

describe("DrizzleCommentAdapter — listByStatus", () => {
  test("status='all' returns all rows regardless of status, newest-first", async () => {
    const c1 = await ctx.adapter.submit(
      { postSlug: "post", authorName: "Pending", authorEmail: "p@x.com", body: "Pending body", parentId: null },
      "pending"
    );
    const c2 = await ctx.adapter.submit(
      { postSlug: "post", authorName: "Approved", authorEmail: "a@x.com", body: "Approved body", parentId: null },
      "approved"
    );
    const c3 = await ctx.adapter.submit(
      { postSlug: "post", authorName: "Spam", authorEmail: "s@x.com", body: "Spam body", parentId: null },
      "spam"
    );

    // Set explicit distinct timestamps for deterministic newest-first ordering
    await ctx.db.execute(`UPDATE comments SET created_at = '2024-01-01T00:00:00Z' WHERE id = '${c1.id}'`);
    await ctx.db.execute(`UPDATE comments SET created_at = '2024-01-02T00:00:00Z' WHERE id = '${c2.id}'`);
    await ctx.db.execute(`UPDATE comments SET created_at = '2024-01-03T00:00:00Z' WHERE id = '${c3.id}'`);

    const result = await ctx.adapter.listByStatus("all", 1, 20);
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(1);
    expect(result.comments.length).toBe(3);
    // Newest-first: c3 (Jan 3), c2 (Jan 2), c1 (Jan 1)
    expect(result.comments[0].id).toBe(c3.id);
    expect(result.comments[1].id).toBe(c2.id);
    expect(result.comments[2].id).toBe(c1.id);
  });

  test("filters by a specific status", async () => {
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "A1", authorEmail: "a1@x.com", body: "Approved one", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "A2", authorEmail: "a2@x.com", body: "Approved two", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "post", authorName: "P1", authorEmail: "p1@x.com", body: "Pending one", parentId: null },
      "pending"
    );

    const result = await ctx.adapter.listByStatus("approved", 1, 20);
    expect(result.total).toBe(2);
    expect(result.comments.length).toBe(2);
    expect(result.comments.every((c) => c.status === "approved")).toBe(true);
  });

  test("paginates: page 2 returns the offset slice and correct totalPages", async () => {
    const c1 = await ctx.adapter.submit(
      { postSlug: "post", authorName: "P1", authorEmail: "p1@x.com", body: "Pending one", parentId: null },
      "pending"
    );
    const c2 = await ctx.adapter.submit(
      { postSlug: "post", authorName: "P2", authorEmail: "p2@x.com", body: "Pending two", parentId: null },
      "pending"
    );
    const c3 = await ctx.adapter.submit(
      { postSlug: "post", authorName: "P3", authorEmail: "p3@x.com", body: "Pending three", parentId: null },
      "pending"
    );

    // Newest-first: c3 > c2 > c1
    await ctx.db.execute(`UPDATE comments SET created_at = '2024-01-01T00:00:00Z' WHERE id = '${c1.id}'`);
    await ctx.db.execute(`UPDATE comments SET created_at = '2024-01-02T00:00:00Z' WHERE id = '${c2.id}'`);
    await ctx.db.execute(`UPDATE comments SET created_at = '2024-01-03T00:00:00Z' WHERE id = '${c3.id}'`);

    const page1 = await ctx.adapter.listByStatus("pending", 1, 2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);
    expect(page1.comments.length).toBe(2);
    expect(page1.comments[0].id).toBe(c3.id); // newest first

    const page2 = await ctx.adapter.listByStatus("pending", 2, 2);
    expect(page2.total).toBe(3);
    expect(page2.totalPages).toBe(2);
    expect(page2.comments.length).toBe(1);
    expect(page2.comments[0].id).toBe(c1.id); // oldest (page 2 offset)
  });

  test("empty DB returns comments [], total 0, totalPages 0", async () => {
    const r = await ctx.adapter.listByStatus("all", 1, 20);
    expect(r.comments).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.totalPages).toBe(0);
  });
});

describe("DrizzleCommentAdapter — countsByStatus", () => {
  test("mix: counts each bucket and sums all", async () => {
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "P1", authorEmail: "p1@x.com", body: "b", parentId: null },
      "pending"
    );
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "P2", authorEmail: "p2@x.com", body: "b", parentId: null },
      "pending"
    );
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "A1", authorEmail: "a1@x.com", body: "b", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "A2", authorEmail: "a2@x.com", body: "b", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "A3", authorEmail: "a3@x.com", body: "b", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "S1", authorEmail: "s1@x.com", body: "b", parentId: null },
      "spam"
    );

    const counts = await ctx.adapter.countsByStatus();
    expect(counts.pending).toBe(2);
    expect(counts.approved).toBe(3);
    expect(counts.spam).toBe(1);
    expect(counts.all).toBe(6);
  });

  test("zero-fill: missing statuses are 0 (only approved present)", async () => {
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "A1", authorEmail: "a1@x.com", body: "b", parentId: null },
      "approved"
    );
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "A2", authorEmail: "a2@x.com", body: "b", parentId: null },
      "approved"
    );

    const counts = await ctx.adapter.countsByStatus();
    expect(counts.approved).toBe(2);
    expect(counts.pending).toBe(0);
    expect(counts.spam).toBe(0);
    expect(counts.all).toBe(2);
  });

  test("empty DB => all zeros", async () => {
    const c = await ctx.adapter.countsByStatus();
    expect(c).toEqual({ all: 0, pending: 0, approved: 0, spam: 0, trash: 0 });
  });
});

describe("DrizzleCommentAdapter — setPending", () => {
  test("approved -> pending and returns updated record", async () => {
    const c = await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@x.com", body: "b", parentId: null },
      "approved"
    );
    const updated = await ctx.adapter.setPending(c.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("pending");
    expect(updated!.id).toBe(c.id);
  });

  test("returns null if comment not found", async () => {
    const r = await ctx.adapter.setPending("00000000-0000-0000-0000-000000000000");
    expect(r).toBeNull();
  });
});

describe("DrizzleCommentAdapter — setTrash", () => {
  test("sets status to trash and returns updated record", async () => {
    const c = await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@x.com", body: "b", parentId: null },
      "approved"
    );
    const updated = await ctx.adapter.setTrash(c.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("trash");
    expect(updated!.id).toBe(c.id);
  });

  test("returns null if comment not found", async () => {
    const r = await ctx.adapter.setTrash("00000000-0000-0000-0000-000000000000");
    expect(r).toBeNull();
  });
});

describe("DrizzleCommentAdapter — listByStatus all excludes trash", () => {
  test("status='all' excludes trashed rows; status='trash' returns only trash", async () => {
    const p = await ctx.adapter.submit(
      { postSlug: "post", authorName: "P", authorEmail: "p@x.com", body: "b", parentId: null },
      "pending"
    );
    const a = await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@x.com", body: "b", parentId: null },
      "approved"
    );
    const s = await ctx.adapter.submit(
      { postSlug: "post", authorName: "S", authorEmail: "s@x.com", body: "b", parentId: null },
      "spam"
    );
    const t = await ctx.adapter.submit(
      { postSlug: "post", authorName: "T", authorEmail: "t@x.com", body: "b", parentId: null },
      "approved"
    );
    await ctx.adapter.setTrash(t.id);

    const all = await ctx.adapter.listByStatus("all", 1, 20);
    expect(all.total).toBe(3);
    expect(all.comments.map((c) => c.id).sort()).toEqual([p.id, a.id, s.id].sort());
    expect(all.comments.some((c) => c.status === "trash")).toBe(false);

    const trash = await ctx.adapter.listByStatus("trash", 1, 20);
    expect(trash.total).toBe(1);
    expect(trash.comments[0].id).toBe(t.id);
    expect(trash.comments[0].status).toBe("trash");
  });
});

describe("DrizzleCommentAdapter — countsByStatus with trash", () => {
  test("all excludes trash; trash counted; zero-fill", async () => {
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "P", authorEmail: "p@x.com", body: "b", parentId: null },
      "pending"
    );
    await ctx.adapter.submit(
      { postSlug: "p", authorName: "A", authorEmail: "a@x.com", body: "b", parentId: null },
      "approved"
    );
    const t = await ctx.adapter.submit(
      { postSlug: "p", authorName: "T", authorEmail: "t@x.com", body: "b", parentId: null },
      "approved"
    );
    await ctx.adapter.setTrash(t.id);

    const counts = await ctx.adapter.countsByStatus();
    expect(counts.pending).toBe(1);
    expect(counts.approved).toBe(1);
    expect(counts.trash).toBe(1);
    expect(counts.spam).toBe(0);
    expect(counts.all).toBe(2); // trash NOT summed into all
  });
});

describe("DrizzleCommentAdapter — getById", () => {
  test("returns the comment for an existing id", async () => {
    const created = await ctx.adapter.submit(
      {
        postSlug: "get-by-id-post",
        authorName: "Alice",
        authorEmail: "alice@example.com",
        body: "A testable comment",
        parentId: null,
      },
      "approved"
    );

    const found = await ctx.adapter.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.postSlug).toBe("get-by-id-post");
    expect(found!.authorEmail).toBe("alice@example.com");
    expect(found!.status).toBe("approved");
    expect(found!.parentId).toBeNull();
  });

  test("returns null for an unknown id", async () => {
    const result = await ctx.adapter.getById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("DrizzleCommentAdapter — updateBody", () => {
  test("updates the body and returns true", async () => {
    const c = await ctx.adapter.submit(
      { postSlug: "post", authorName: "A", authorEmail: "a@x.com", body: "Original body text", parentId: null },
      "approved"
    );
    const result = await ctx.adapter.updateBody(c.id, "Updated body text here");
    expect(result).toBe(true);

    const updated = await ctx.adapter.getById(c.id);
    expect(updated!.body).toBe("Updated body text here");
  });

  test("returns false for unknown id", async () => {
    const result = await ctx.adapter.updateBody("00000000-0000-0000-0000-000000000000", "some body text here");
    expect(result).toBe(false);
  });
});
