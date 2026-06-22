import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// comment_status postgres enum: pending | approved | spam | trash
export const commentStatus = pgEnum("comment_status", [
  "pending",
  "approved",
  "spam",
  "trash",
]);

// comments table — canonical schema for Drizzle push
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postSlug: text("post_slug").notNull(),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email").notNull(),
    authorUrl: text("author_url"),
    body: text("body").notNull(),
    // No SQL default — status is always passed explicitly by the caller
    status: commentStatus("status").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_comments_post_slug_status").on(t.postSlug, t.status),
    index("idx_comments_parent_id").on(t.parentId),
    index("idx_comments_status_created_at").on(t.status, t.createdAt),
  ]
);
