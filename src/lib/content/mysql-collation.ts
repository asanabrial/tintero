/**
 * MySQL/MariaDB identity-column collation hardening.
 *
 * WHY THIS EXISTS
 * ----------------
 * sqlite (libSQL) and postgres compare TEXT case- AND accent-SENSITIVELY by
 * default, so the content store treats slugs like "Foo" and "foo" as DISTINCT
 * identities. MySQL's server default collation `utf8mb4_0900_ai_ci` is case- and
 * accent-INSENSITIVE: ("post","Foo") and ("post","foo") collapse to the SAME key
 * on the `idx_content_type_slug` unique index, and equality lookups (slug = ?)
 * match the wrong row. That silently breaks parity with the other three dialects.
 *
 * WHY IT IS NOT IN schema.mysql.ts
 * --------------------------------
 * drizzle-orm 0.45.2's mysql-core `varchar()` builder has NO per-column collation
 * option (MySqlVarCharConfig exposes only { length, enum }). The generated DDL —
 * whether via `drizzle-kit push` or a migration — therefore inherits the server/
 * table default collation. There is no way to pin a binary collation through the
 * drizzle schema in this version, so the override has to be applied as raw DDL
 * AFTER the table is created.
 *
 * THE FIX
 * -------
 * Pin `utf8mb4_bin` (byte-exact, case- and accent-sensitive) on every identity /
 * FK / indexed-key column so MySQL matches the sqlite/pg semantics exactly:
 *   - content:            id, type, slug, parent_id, author_id, live_slug_key
 *   - terms:              id, taxonomy, slug, parent_id
 *   - term_relationships: content_id, term_id
 *   - content_meta:       id, content_id, meta_key
 *
 * Non-indexed free-text columns (title, body_markdown, excerpt, …) are left at the
 * server default on purpose — they are never used as identities or lookup keys, so
 * their collation does not affect correctness.
 *
 * FK COLLATION MATCHING: MySQL requires a foreign-key column and its referenced
 * column to share the same charset+collation. Because every FK and its target is
 * pinned to utf8mb4_bin here, the constraints stay valid. The statements run with
 * FOREIGN_KEY_CHECKS disabled so the transient per-column rewrite never trips the
 * matching rule mid-flight.
 *
 * The `live_slug_key` generated column must be RE-DECLARED with its full
 * expression to attach the collation (you cannot ALTER ... MODIFY a generated
 * column's collation without restating GENERATED ALWAYS AS (...)).
 *
 * PRODUCTION USAGE
 * ----------------
 * Run AFTER `drizzle-kit push`/migrate for a mysql or mariadb DATABASE_DIALECT:
 *
 *   import { getContentDb } from "@/lib/content/db-factory";
 *   import { applyMysqlIdentityCollation } from "@/lib/content/mysql-collation";
 *   await applyMysqlIdentityCollation(getContentDb());
 *
 * Each statement is idempotent — re-applying the same collation is a no-op rewrite.
 */

import { sql } from "drizzle-orm";

/**
 * Ordered raw DDL statements that pin `utf8mb4_bin` on the content store's
 * identity/FK/indexed columns. Wrapped in FOREIGN_KEY_CHECKS toggles so the
 * per-column rewrites never violate FK collation matching mid-sequence.
 */
export const MYSQL_IDENTITY_COLLATION_STATEMENTS: readonly string[] = [
  "SET FOREIGN_KEY_CHECKS = 0",
  // content — identity, FKs, and the generated live-slug key.
  "ALTER TABLE content " +
    "MODIFY id varchar(36) COLLATE utf8mb4_bin NOT NULL, " +
    "MODIFY type varchar(32) COLLATE utf8mb4_bin NOT NULL, " +
    "MODIFY slug varchar(255) COLLATE utf8mb4_bin NOT NULL, " +
    "MODIFY parent_id varchar(36) COLLATE utf8mb4_bin NULL, " +
    "MODIFY author_id varchar(36) COLLATE utf8mb4_bin NULL",
  // live_slug_key is generated — restate the expression to attach the collation.
  "ALTER TABLE content MODIFY live_slug_key varchar(320) COLLATE utf8mb4_bin " +
    "GENERATED ALWAYS AS (case when `deleted_at` is null " +
    "then concat(`type`, 0x1f, `slug`) else null end) STORED",
  // terms — identity + FK + scoped unique key (taxonomy, slug).
  "ALTER TABLE terms " +
    "MODIFY id varchar(36) COLLATE utf8mb4_bin NOT NULL, " +
    "MODIFY taxonomy varchar(32) COLLATE utf8mb4_bin NOT NULL, " +
    "MODIFY slug varchar(255) COLLATE utf8mb4_bin NOT NULL, " +
    "MODIFY parent_id varchar(36) COLLATE utf8mb4_bin NULL",
  // term_relationships — both FKs (composite PK).
  "ALTER TABLE term_relationships " +
    "MODIFY content_id varchar(36) COLLATE utf8mb4_bin NOT NULL, " +
    "MODIFY term_id varchar(36) COLLATE utf8mb4_bin NOT NULL",
  // content_meta — identity, FK, and the unique meta_key.
  "ALTER TABLE content_meta " +
    "MODIFY id varchar(36) COLLATE utf8mb4_bin NOT NULL, " +
    "MODIFY content_id varchar(36) COLLATE utf8mb4_bin NOT NULL, " +
    "MODIFY meta_key varchar(191) COLLATE utf8mb4_bin NOT NULL",
  "SET FOREIGN_KEY_CHECKS = 1",
];

/**
 * Minimal structural type for the drizzle mysql executor: just `.execute(sql)`.
 * Kept local so this module does not depend on a concrete drizzle database type.
 */
interface MysqlExecutor {
  execute(query: unknown): Promise<unknown>;
}

/**
 * Apply the identity-column collation override to a live MySQL/MariaDB content
 * store. Idempotent. Call once after the schema is created/pushed.
 */
export async function applyMysqlIdentityCollation(
  db: MysqlExecutor
): Promise<void> {
  for (const statement of MYSQL_IDENTITY_COLLATION_STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
}
