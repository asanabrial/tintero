/**
 * Logical schema descriptor — single source of truth for all content-layer tables.
 *
 * This file contains NO Drizzle-dialect-specific code. It describes the logical
 * shape of each table using plain type tags so that:
 *   1. The conformance test (test/lib/content/schema-conformance.test.ts) can
 *      assert that every per-dialect schema file (schema.pg.ts, schema.sqlite.ts)
 *      matches this descriptor exactly — catching column drift and index drift
 *      between dialects.
 *   2. Future tooling (validators, migration helpers, documentation generators)
 *      has a single place to read the schema shape.
 *
 * LCD type policy (§4.3 of the architecture design):
 *   - PKs are app-generated UUIDs stored as text (no uuid() / defaultRandom() / serial).
 *   - Enum-like columns use text (Zod validates at the boundary, not the DB).
 *   - Timestamps are epoch milliseconds (integer), not timestamp/Date columns.
 *   - Booleans are integer 0/1 (no native boolean type).
 *
 * LogicalType tags:
 *   "text"         — text column, NOT NULL
 *   "text-null"    — text column, nullable
 *   "integer"      — integer column, NOT NULL
 *   "integer-null" — integer column, nullable
 */

export type LogicalType = "text" | "integer" | "text-null" | "integer-null";

// ---------------------------------------------------------------------------
// Index descriptor types
// ---------------------------------------------------------------------------

/**
 * Per-column sort direction within a specific index.
 *
 * NOTE: `order` is only enforceable in PostgreSQL (pg-core exposes `.desc()` on
 * columns inside index builders). drizzle-orm/sqlite-core v0.45 does NOT expose
 * a `.desc()` method on integer/text columns for index definitions, so the
 * sqlite conformance check asserts column names and uniqueness but skips direction.
 */
export interface IndexColumnDescriptor {
  name: string;
  /** Default is "asc". Set to "desc" for columns that should be indexed descending. */
  order: "asc" | "desc";
}

/**
 * Describes one index (unique or non-unique) as it should appear in both per-dialect
 * schema files.
 */
export interface IndexDescriptor {
  /** Exact Drizzle index name (matches the string passed to `index()` / `uniqueIndex()`). */
  name: string;
  /** True when declared with `uniqueIndex()`; false for `index()`. */
  unique: boolean;
  /** Ordered list of columns in the index. Order is significant. */
  columns: IndexColumnDescriptor[];
}

export interface TableDescriptor {
  /** Column name → logical type tag. This is what the conformance test asserts. */
  columns: Record<string, LogicalType>;
  /**
   * Primary key column name(s). Single-element array for simple PKs; multi-element
   * for composite PKs (e.g. term_relationships). For composite PKs the conformance
   * test asserts that `getTableConfig(table).primaryKeys` contains exactly one entry
   * whose column list matches this array.
   */
  pk: string[];
  /**
   * All indexes for this table — both unique and non-unique — in any order.
   * The conformance test sorts by name before comparing, so declaration order here
   * does not matter.
   */
  indexes: IndexDescriptor[];
}

// ---------------------------------------------------------------------------
// The descriptor
// ---------------------------------------------------------------------------

export const SCHEMA_DESCRIPTOR = {
  // -------------------------------------------------------------------------
  // content — posts AND pages, one table with a `type` discriminator (§3.1)
  // -------------------------------------------------------------------------
  content: {
    columns: {
      id: "text",
      type: "text",
      slug: "text",
      title: "text",
      status: "text",
      visibility: "text",
      password: "text-null",
      body_markdown: "text",
      excerpt: "text-null",
      cover_image: "text-null",
      author_label: "text-null",
      author_id: "text-null",
      sticky: "integer",
      comments_enabled: "integer",
      parent_id: "text-null",
      menu_order: "integer",
      published_at: "integer",
      created_at: "integer",
      updated_at: "integer",
    } satisfies Record<string, LogicalType>,
    pk: ["id"],
    indexes: [
      // Unique slug per content type (§10 #5)
      {
        name: "idx_content_type_slug",
        unique: true,
        columns: [
          { name: "type", order: "asc" },
          { name: "slug", order: "asc" },
        ],
      },
      // Primary list/keyset index — covers listPosts/listPages ordered by recency.
      // published_at is DESC to serve most-recent-first without a filesort (§3.5).
      {
        name: "idx_content_type_status_published_at_id",
        unique: false,
        columns: [
          { name: "type", order: "asc" },
          { name: "status", order: "asc" },
          { name: "published_at", order: "desc" },
          { name: "id", order: "asc" },
        ],
      },
      // Status count index — drives GROUP BY for listPostStatusCounts
      {
        name: "idx_content_type_status",
        unique: false,
        columns: [
          { name: "type", order: "asc" },
          { name: "status", order: "asc" },
        ],
      },
      // Page hierarchy — parent/child lookups
      {
        name: "idx_content_parent_id",
        unique: false,
        columns: [{ name: "parent_id", order: "asc" }],
      },
      // Author archive pages
      {
        name: "idx_content_author_id",
        unique: false,
        columns: [{ name: "author_id", order: "asc" }],
      },
    ] satisfies IndexDescriptor[],
  },

  // -------------------------------------------------------------------------
  // terms — taxonomy with a real parent_id (§3.2)
  // -------------------------------------------------------------------------
  terms: {
    columns: {
      id: "text",
      taxonomy: "text",
      slug: "text",
      label: "text",
      parent_id: "text-null",
      description_markdown: "text-null",
      count: "integer",
      created_at: "integer",
      updated_at: "integer",
    } satisfies Record<string, LogicalType>,
    pk: ["id"],
    indexes: [
      // Term lookup by slug; uniqueness scoped per taxonomy
      {
        name: "idx_terms_taxonomy_slug",
        unique: true,
        columns: [
          { name: "taxonomy", order: "asc" },
          { name: "slug", order: "asc" },
        ],
      },
      // Hierarchy walk — parent → children
      {
        name: "idx_terms_parent_id",
        unique: false,
        columns: [{ name: "parent_id", order: "asc" }],
      },
    ] satisfies IndexDescriptor[],
  },

  // -------------------------------------------------------------------------
  // term_relationships — content ↔ term join table (§3.3)
  // -------------------------------------------------------------------------
  term_relationships: {
    columns: {
      content_id: "text",
      term_id: "text",
    } satisfies Record<string, LogicalType>,
    pk: ["content_id", "term_id"],
    indexes: [
      // content → its terms
      {
        name: "idx_term_rel_content_id",
        unique: false,
        columns: [{ name: "content_id", order: "asc" }],
      },
      // term → its content (archive listings)
      {
        name: "idx_term_rel_term_id",
        unique: false,
        columns: [{ name: "term_id", order: "asc" }],
      },
    ] satisfies IndexDescriptor[],
  },

  // -------------------------------------------------------------------------
  // content_meta — WP-style key/value for SEO + extensible fields (§3.4)
  // -------------------------------------------------------------------------
  content_meta: {
    columns: {
      id: "text",
      content_id: "text",
      meta_key: "text",
      meta_value: "text-null",
    } satisfies Record<string, LogicalType>,
    pk: ["id"],
    indexes: [
      // SEO/custom-field lookup per content — unique for idempotent upserts
      {
        name: "idx_content_meta_content_id_meta_key",
        unique: true,
        columns: [
          { name: "content_id", order: "asc" },
          { name: "meta_key", order: "asc" },
        ],
      },
    ] satisfies IndexDescriptor[],
  },
} as const satisfies Record<string, TableDescriptor>;
