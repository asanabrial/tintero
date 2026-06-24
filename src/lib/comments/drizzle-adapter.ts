// DrizzleCommentAdapter — implements CommentRepository using an injected drizzle instance.
// No imports from pg, @electric-sql/pglite, React, or Next.js.

import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import { comments } from "./schema";
import type { Comment, CommentInput, CommentStatus, CommentThread, PublicComment } from "./types";
import { CommentDepthError, CommentNotFoundError, CommentUnapprovedError } from "./types";
import type { CommentRepository, CommentStatusCounts } from "./ports";
import { gravatarUrl } from "@/lib/avatar/gravatar";

// We use the drizzle instance typed broadly to avoid driver-specific imports.
// The actual drizzle type is inferred at injection time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any;

/** Maps a DB row (with authorEmail) to a Comment. */
function toComment(row: {
  id: string;
  postSlug: string;
  authorName: string;
  authorEmail: string;
  authorUrl: string | null;
  body: string;
  status: "pending" | "approved" | "spam" | "trash";
  parentId: string | null;
  createdAt: Date;
}): Comment {
  return {
    id: row.id,
    postSlug: row.postSlug,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    authorUrl: row.authorUrl,
    body: row.body,
    status: row.status,
    parentId: row.parentId,
    createdAt: row.createdAt,
  };
}

/** Maps a DB row to a PublicComment (no authorEmail). */
function toPublicComment(row: {
  id: string;
  postSlug: string;
  authorName: string;
  authorUrl: string | null;
  body: string;
  status: "pending" | "approved" | "spam" | "trash";
  parentId: string | null;
  createdAt: Date;
}): PublicComment {
  return {
    id: row.id,
    postSlug: row.postSlug,
    authorName: row.authorName,
    authorUrl: row.authorUrl,
    body: row.body,
    status: row.status,
    parentId: row.parentId,
    createdAt: row.createdAt,
  };
}

/**
 * Maps a DB row (including authorEmail for Gravatar computation) to a PublicComment with avatarUrl.
 * authorEmail is used to compute the Gravatar hash and is then discarded — never surfaces in the result.
 */
function toPublicCommentWithAvatar(row: {
  id: string;
  postSlug: string;
  authorName: string;
  authorEmail: string;
  authorUrl: string | null;
  body: string;
  status: "pending" | "approved" | "spam" | "trash";
  parentId: string | null;
  createdAt: Date;
}): PublicComment {
  return {
    ...toPublicComment(row),
    avatarUrl: gravatarUrl(row.authorEmail, { size: 40 }),
  };
}

export class DrizzleCommentAdapter implements CommentRepository {
  constructor(private readonly db: DrizzleDb) {}

  async listApproved(slug: string): Promise<CommentThread[]> {
    // SELECT includes authorEmail solely to compute Gravatar hash server-side.
    // authorEmail is discarded after hashing — never surfaces in PublicComment.
    const rows = await this.db
      .select({
        id: comments.id,
        postSlug: comments.postSlug,
        authorName: comments.authorName,
        authorEmail: comments.authorEmail,
        authorUrl: comments.authorUrl,
        body: comments.body,
        status: comments.status,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(and(eq(comments.postSlug, slug), eq(comments.status, "approved")))
      .orderBy(asc(comments.createdAt));

    // Group into threads: top-level first, replies nested under parent
    const topLevel = rows.filter((r: { parentId: string | null }) => r.parentId === null);
    const byParent = new Map<string, typeof rows>();
    for (const row of rows) {
      if (row.parentId !== null) {
        const siblings = byParent.get(row.parentId) ?? [];
        siblings.push(row);
        byParent.set(row.parentId, siblings);
      }
    }

    // Build threads — orphaned replies (parent not in topLevel set) are excluded
    const topLevelIds = new Set(topLevel.map((r: { id: string }) => r.id));
    const threads: CommentThread[] = topLevel.map((parent: typeof rows[0]) => ({
      comment: toPublicCommentWithAvatar(parent),
      replies: (byParent.get(parent.id) ?? [])
        .filter((r: { parentId: string | null }) => r.parentId !== null && topLevelIds.has(r.parentId as string))
        .map(toPublicCommentWithAvatar),
    }));

    return threads;
  }

  async countApproved(slug: string): Promise<number> {
    const result = await this.db
      .select({ value: count() })
      .from(comments)
      .where(and(eq(comments.postSlug, slug), eq(comments.status, "approved")));
    return Number(result[0]?.value ?? 0);
  }

  async countApprovedBySlugs(slugs: string[]): Promise<Record<string, number>> {
    // Zero-fill so every requested slug is present even with no approved comments.
    const result: Record<string, number> = {};
    for (const slug of slugs) result[slug] = 0;
    if (slugs.length === 0) return result;

    const rows = await this.db
      .select({ slug: comments.postSlug, value: count() })
      .from(comments)
      .where(and(inArray(comments.postSlug, slugs), eq(comments.status, "approved")))
      .groupBy(comments.postSlug);

    for (const row of rows) result[row.slug] = Number(row.value ?? 0);
    return result;
  }

  async submit(input: CommentInput, status: CommentStatus): Promise<Comment> {
    // Depth guard: validate parentId if provided
    if (input.parentId) {
      const parents = await this.db
        .select({
          id: comments.id,
          status: comments.status,
          parentId: comments.parentId,
        })
        .from(comments)
        .where(eq(comments.id, input.parentId));

      if (parents.length === 0) {
        throw new CommentNotFoundError(
          `The comment you are replying to does not exist.`
        );
      }

      const parent = parents[0];
      if (parent.status !== "approved") {
        throw new CommentUnapprovedError(
          `The comment you are replying to is not available.`
        );
      }

      if (parent.parentId !== null) {
        throw new CommentDepthError(`Replies to replies are not allowed.`);
      }
    }

    const inserted = await this.db
      .insert(comments)
      .values({
        postSlug: input.postSlug,
        authorName: input.authorName,
        authorEmail: input.authorEmail,
        authorUrl: input.authorUrl ?? null,
        body: input.body,
        status,
        parentId: input.parentId ?? null,
      })
      .returning();

    return toComment(inserted[0]);
  }

  async getById(id: string): Promise<Comment | null> {
    const rows = await this.db
      .select()
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1);
    return rows.length > 0 ? toComment(rows[0]) : null;
  }

  async listRecentApproved(limit: number): Promise<PublicComment[]> {
    // SELECT same 8 columns as listApproved — NO authorEmail (REQ-ADAPTER-05 / REQ-CS-02)
    const rows = await this.db
      .select({
        id: comments.id,
        postSlug: comments.postSlug,
        authorName: comments.authorName,
        authorUrl: comments.authorUrl,
        body: comments.body,
        status: comments.status,
        parentId: comments.parentId,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(eq(comments.status, "approved"))
      .orderBy(desc(comments.createdAt))
      .limit(limit);
    return rows.map(toPublicComment);
  }

  async listPending(): Promise<Comment[]> {
    const rows = await this.db
      .select()
      .from(comments)
      .where(eq(comments.status, "pending"))
      .orderBy(asc(comments.createdAt));
    return rows.map(toComment);
  }

  async approve(id: string): Promise<Comment | null> {
    const rows = await this.db
      .update(comments)
      .set({ status: "approved" })
      .where(eq(comments.id, id))
      .returning();
    return rows.length > 0 ? toComment(rows[0]) : null;
  }

  async setSpam(id: string): Promise<Comment | null> {
    const rows = await this.db
      .update(comments)
      .set({ status: "spam" })
      .where(eq(comments.id, id))
      .returning();
    return rows.length > 0 ? toComment(rows[0]) : null;
  }

  async setTrash(id: string): Promise<Comment | null> {
    const rows = await this.db
      .update(comments)
      .set({ status: "trash" })
      .where(eq(comments.id, id))
      .returning();
    return rows.length > 0 ? toComment(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(comments)
      .where(eq(comments.id, id))
      .returning({ id: comments.id });
    return rows.length > 0;
  }

  async updateBody(id: string, body: string): Promise<boolean> {
    const rows = await this.db
      .update(comments)
      .set({ body })
      .where(eq(comments.id, id))
      .returning({ id: comments.id });
    return rows.length > 0;
  }

  async listByStatus(
    status: CommentStatus | "all",
    page: number,
    pageSize: number
  ): Promise<{ comments: Comment[]; total: number; totalPages: number }> {
    const where =
      status === "all" ? ne(comments.status, "trash") : eq(comments.status, status);

    const totalResult = await this.db
      .select({ value: count() })
      .from(comments)
      .where(where);
    const total = Number(totalResult[0]?.value ?? 0);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    const safePage = page < 1 ? 1 : page;
    const offset = (safePage - 1) * pageSize;

    const rows = await this.db
      .select()
      .from(comments)
      .where(where)
      .orderBy(desc(comments.createdAt))
      .limit(pageSize)
      .offset(offset);

    return { comments: rows.map(toComment), total, totalPages };
  }

  async countsByStatus(): Promise<CommentStatusCounts> {
    const rows = await this.db
      .select({ status: comments.status, value: count() })
      .from(comments)
      .groupBy(comments.status);

    // Zero-fill: GROUP BY omits statuses with no rows.
    const counts: CommentStatusCounts = { all: 0, pending: 0, approved: 0, spam: 0, trash: 0 };
    for (const row of rows as { status: CommentStatus; value: number }[]) {
      const n = Number(row.value ?? 0);
      counts[row.status] = n;
      // trash is logically deleted — excluded from the "All" count
      if (row.status !== "trash") counts.all += n;
    }
    return counts;
  }

  async setPending(id: string): Promise<Comment | null> {
    const rows = await this.db
      .update(comments)
      .set({ status: "pending" })
      .where(eq(comments.id, id))
      .returning();
    return rows.length > 0 ? toComment(rows[0]) : null;
  }
}
