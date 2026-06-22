import { index, pgEnum, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

// revision_source postgres enum: admin | api | cli | wizard
export const revisionSource = pgEnum("revision_source", [
  "admin",
  "api",
  "cli",
  "wizard",
]);

// post_revisions table — canonical schema for Drizzle push
export const postRevisions = pgTable(
  "post_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentType: text("content_type").notNull(),
    slug: text("slug").notNull(),
    rawContent: text("raw_content").notNull(),
    source: revisionSource("source").notNull(),
    authorId: text("author_id"),
    authorLabel: text("author_label"),
    sequence: serial("sequence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_post_revisions_slug_type_created").on(
      t.slug,
      t.contentType,
      t.createdAt
    ),
  ]
);
