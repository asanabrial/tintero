/**
 * PostgreSQL content schema — per-dialect schema file for the content layer.
 *
 * All types follow the LCD (lowest-common-denominator) policy from §4.3:
 *   - PKs: app-generated UUID stored as text (no uuid()/defaultRandom()/serial)
 *   - Enums: plain text column (Zod validates at the boundary, not the DB)
 *   - Timestamps: integer (epoch milliseconds, UTC)
 *   - Booleans: integer 0/1
 *
 * The logical shape is kept identical to schema.sqlite.ts. The conformance test
 * (test/lib/content/schema-conformance.test.ts) asserts this at the column level
 * using schema-descriptor.ts as the single source of truth.
 *
 * Indexes are defined per §3.5 of the architecture design.
 */

import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// content — posts AND pages, one table with a `type` discriminator (§3.1)
// ---------------------------------------------------------------------------

export const content = pgTable(
  "content",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    visibility: text("visibility").notNull(),
    password: text("password"),
    body_markdown: text("body_markdown").notNull(),
    excerpt: text("excerpt"),
    cover_image: text("cover_image"),
    author_label: text("author_label"),
    author_id: text("author_id"),
    sticky: integer("sticky").notNull(),
    comments_enabled: integer("comments_enabled").notNull(),
    parent_id: text("parent_id").references((): AnyPgColumn => content.id),
    menu_order: integer("menu_order").notNull(),
    published_at: integer("published_at").notNull(),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    // Unique slug per content type (§10 #5)
    uniqueIndex("idx_content_type_slug").on(t.type, t.slug),
    // Primary list/keyset index — covers listPosts/listPages ordered by recency.
    // published_at DESC serves most-recent-first without a filesort (§3.5).
    index("idx_content_type_status_published_at_id").on(
      t.type,
      t.status,
      t.published_at.desc(),
      t.id
    ),
    // Status count index — drives GROUP BY for listPostStatusCounts
    index("idx_content_type_status").on(t.type, t.status),
    // Page hierarchy — parent/child lookups
    index("idx_content_parent_id").on(t.parent_id),
    // Author archive pages
    index("idx_content_author_id").on(t.author_id),
  ]
);

// ---------------------------------------------------------------------------
// terms — taxonomy with a real parent_id (§3.2)
// ---------------------------------------------------------------------------

export const terms = pgTable(
  "terms",
  {
    id: text("id").primaryKey(),
    taxonomy: text("taxonomy").notNull(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    parent_id: text("parent_id").references((): AnyPgColumn => terms.id),
    description_markdown: text("description_markdown"),
    count: integer("count").notNull(),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    // Term lookup by slug; uniqueness scoped per taxonomy
    uniqueIndex("idx_terms_taxonomy_slug").on(t.taxonomy, t.slug),
    // Hierarchy walk — parent → children
    index("idx_terms_parent_id").on(t.parent_id),
  ]
);

// ---------------------------------------------------------------------------
// term_relationships — content ↔ term join table (§3.3)
// ---------------------------------------------------------------------------

export const term_relationships = pgTable(
  "term_relationships",
  {
    content_id: text("content_id")
      .notNull()
      .references((): AnyPgColumn => content.id),
    term_id: text("term_id")
      .notNull()
      .references((): AnyPgColumn => terms.id),
  },
  (t) => [
    // Composite primary key — prevents duplicate relationships
    primaryKey({ columns: [t.content_id, t.term_id] }),
    // content → its terms
    index("idx_term_rel_content_id").on(t.content_id),
    // term → its content (archive listings)
    index("idx_term_rel_term_id").on(t.term_id),
  ]
);

// ---------------------------------------------------------------------------
// content_meta — WP-style key/value for SEO + extensible fields (§3.4)
// ---------------------------------------------------------------------------

export const content_meta = pgTable(
  "content_meta",
  {
    id: text("id").primaryKey(),
    content_id: text("content_id")
      .notNull()
      .references((): AnyPgColumn => content.id),
    meta_key: text("meta_key").notNull(),
    meta_value: text("meta_value"),
  },
  (t) => [
    // SEO/custom-field lookup per content
    index("idx_content_meta_content_id_meta_key").on(t.content_id, t.meta_key),
  ]
);
