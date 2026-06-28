/**
 * MySQL / MariaDB content schema — per-dialect schema file for the content layer.
 *
 * Shared by both MySQL and MariaDB (both use drizzle-orm/mysql-core + the mysql2
 * driver). The logical shape is kept identical to schema.pg.ts and
 * schema.sqlite.ts; the conformance test (test/lib/content/schema-conformance.test.ts)
 * asserts this at the column/index/pk level using schema-descriptor.ts as the
 * single source of truth — without a live database.
 *
 * Type mapping (LCD policy §4.3, adapted to MySQL constraints):
 *   - PKs / FKs (UUID, text): varchar(36). MySQL cannot index/PK a TEXT column
 *     without a prefix length, so every indexed text column becomes varchar.
 *   - Enum-like columns: varchar(32) (type, status, taxonomy). Zod validates at
 *     the boundary, not the DB.
 *   - slug: varchar(255); meta_key: varchar(191) (fits the historical 767-byte
 *     index limit at utf8mb4 = 4 bytes/char → 191*4 = 764).
 *   - Non-indexed free text stays TEXT (title, password, body_markdown, excerpt,
 *     cover_image, author_label, label, description_markdown, meta_value).
 *   - Timestamps: bigint({ mode: "number" }) — epoch milliseconds (UTC). Keeps
 *     db-values.ts toEpoch/fromEpoch unchanged. mode:"number" returns a JS number
 *     (not BigInt), within Number.MAX_SAFE_INTEGER, matching pg/sqlite.
 *   - Booleans + small ints: int() (sticky, comments_enabled, menu_order, count).
 *
 * Partial-unique-index replacement (§10 #5 / design):
 *   pg/sqlite use `UNIQUE (type, slug) WHERE deleted_at IS NULL` so a trashed row
 *   frees its slug for reuse. MySQL has NO partial indexes. We instead add a STORED
 *   generated column `live_slug_key` = CONCAT(type, 0x1f, slug) for live rows and
 *   NULL for trashed rows, with a plain UNIQUE index on it. MySQL treats NULLs as
 *   distinct in unique indexes, so trashed rows never collide while live rows
 *   enforce unique (type, slug). The 0x1f (unit separator) byte prevents
 *   ("a","bc") and ("ab","c") from concatenating to the same key.
 *
 * Indexes are defined per §3.5 of the architecture design and mirror the index
 * NAMES used by schema.pg.ts / schema.sqlite.ts so conformance matches.
 */

import { sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import {
  bigint,
  index,
  int,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// ---------------------------------------------------------------------------
// content — posts AND pages, one table with a `type` discriminator (§3.1)
// ---------------------------------------------------------------------------

export const content = mysqlTable(
  "content",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    type: varchar("type", { length: 32 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    title: text("title").notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    visibility: varchar("visibility", { length: 32 }).notNull(),
    password: text("password"),
    body_markdown: text("body_markdown").notNull(),
    excerpt: text("excerpt"),
    cover_image: text("cover_image"),
    author_label: text("author_label"),
    author_id: varchar("author_id", { length: 36 }),
    sticky: int("sticky").notNull(),
    comments_enabled: int("comments_enabled").notNull(),
    parent_id: varchar("parent_id", { length: 36 }).references(
      (): AnyMySqlColumn => content.id
    ),
    menu_order: int("menu_order").notNull(),
    // Epoch milliseconds — BIGINT (ms values ~1.75e12 exceed INT max ~2.1e9)
    published_at: bigint("published_at", { mode: "number" }).notNull(),
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
    // Soft-delete: epoch-ms when the row was trashed, NULL = live.
    // Orthogonal to status (published/draft) — trashing does not change status.
    // Read paths filter WHERE deleted_at IS NULL; only backfill/trash writers set this.
    deleted_at: bigint("deleted_at", { mode: "number" }),
    // MySQL-only: STORED generated column replacing the partial unique index.
    // NULL for trashed rows (so they never collide); CONCAT(type, 0x1f, slug)
    // for live rows (so live (type, slug) is unique). See the file header.
    live_slug_key: varchar("live_slug_key", { length: 320 }).generatedAlwaysAs(
      sql`(case when \`deleted_at\` is null then concat(\`type\`, 0x1f, \`slug\`) else null end)`,
      { mode: "stored" }
    ),
  },
  (t) => [
    // Unique slug per content type among LIVE rows (§10 #5).
    // MySQL has no partial indexes — a plain UNIQUE index on the STORED generated
    // `live_slug_key` reproduces the pg/sqlite `WHERE deleted_at IS NULL` semantics
    // (trashed rows are NULL → distinct; live rows enforce unique (type, slug)).
    uniqueIndex("idx_content_type_slug").on(t.live_slug_key),
    // Primary list/keyset index — covers listPosts/listPages ordered by recency.
    index("idx_content_type_status_published_at_id").on(
      t.type,
      t.status,
      t.published_at,
      t.id
    ),
    // Status count index — drives GROUP BY for listPostStatusCounts
    index("idx_content_type_status").on(t.type, t.status),
    // Page hierarchy — parent/child lookups
    index("idx_content_parent_id").on(t.parent_id),
    // Author archive pages
    index("idx_content_author_id").on(t.author_id),
    // Soft-delete filter — cheap IS NULL scan for live-content reads
    index("idx_content_deleted_at").on(t.deleted_at),
  ]
);

// ---------------------------------------------------------------------------
// terms — taxonomy with a real parent_id (§3.2)
// ---------------------------------------------------------------------------

export const terms = mysqlTable(
  "terms",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    taxonomy: varchar("taxonomy", { length: 32 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    label: text("label").notNull(),
    parent_id: varchar("parent_id", { length: 36 }).references(
      (): AnyMySqlColumn => terms.id
    ),
    description_markdown: text("description_markdown"),
    count: int("count").notNull(),
    // Epoch milliseconds — BIGINT required (see content table comment above)
    created_at: bigint("created_at", { mode: "number" }).notNull(),
    updated_at: bigint("updated_at", { mode: "number" }).notNull(),
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

export const term_relationships = mysqlTable(
  "term_relationships",
  {
    content_id: varchar("content_id", { length: 36 })
      .notNull()
      .references((): AnyMySqlColumn => content.id),
    term_id: varchar("term_id", { length: 36 })
      .notNull()
      .references((): AnyMySqlColumn => terms.id),
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

export const content_meta = mysqlTable(
  "content_meta",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    content_id: varchar("content_id", { length: 36 })
      .notNull()
      .references((): AnyMySqlColumn => content.id),
    meta_key: varchar("meta_key", { length: 191 }).notNull(),
    meta_value: text("meta_value"),
  },
  (t) => [
    // SEO/custom-field lookup per content — unique so onDuplicateKeyUpdate works
    // for idempotent backfill and SEO upserts.
    uniqueIndex("idx_content_meta_content_id_meta_key").on(
      t.content_id,
      t.meta_key
    ),
  ]
);
