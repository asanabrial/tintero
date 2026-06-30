/**
 * MySQL/MariaDB content-store collation hardening (DATABASE DEFAULT approach).
 *
 * WHY THIS EXISTS
 * ----------------
 * sqlite (libSQL) and postgres compare TEXT case- AND accent-SENSITIVELY by
 * default, so the content store treats slugs like "Foo" and "foo" as DISTINCT
 * identities. MySQL's server default collation `utf8mb4_0900_ai_ci` (MariaDB:
 * `utf8mb4_general_ci`) is case- and accent-INSENSITIVE: ("post","Foo") and
 * ("post","foo") collapse to the SAME key on the `idx_content_type_slug` unique
 * index, and equality lookups (slug = ?) match the wrong row. That silently
 * breaks parity with the other three dialects.
 *
 * WHY THE DATABASE DEFAULT — NOT A PER-COLUMN ALTER
 * -------------------------------------------------
 * The obvious fix is a post-push `ALTER TABLE ... MODIFY <col> COLLATE utf8mb4_bin`
 * on every identity/FK/key column. It WORKS on MySQL 8, but it is FUNDAMENTALLY
 * INCOMPATIBLE with MariaDB: MariaDB refuses to MODIFY a column that is part of a
 * foreign key with `ER_FK_COLUMN_CANNOT_CHANGE_CHILD`, and — unlike a row-level FK
 * check — `SET FOREIGN_KEY_CHECKS = 0` does NOT bypass this DDL-time restriction.
 * The content schema is full of FK columns (parent_id, content_id, term_id, …), so
 * the per-column rewrite is a dead end on MariaDB.
 *
 * Instead we set the DATABASE default collation to `utf8mb4_bin` BEFORE the tables
 * are created. Every column then INHERITS `utf8mb4_bin` at CREATE time — no
 * per-column ALTER, so the MariaDB FK restriction is never triggered. Verified on
 * both MySQL 8.4 and MariaDB 11: after
 *
 *     ALTER DATABASE `<db>` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
 *
 * followed by `drizzle-kit push`, every column (id, type, slug, title, …) comes out
 * `utf8mb4_bin`. The `live_slug_key` STORED generated column's `concat()` inherits
 * `utf8mb4_bin` too, so its UNIQUE index is byte-exact (case-sensitive) — matching
 * the sqlite/pg `(type, slug)` identity semantics with no extra DDL.
 *
 * ORDERING (CRITICAL)
 * -------------------
 * `ALTER DATABASE ... COLLATE` only changes the DEFAULT applied to NEWLY created
 * tables; it does NOT re-collate columns of tables that already exist. So this MUST
 * run BEFORE the schema is pushed/migrated. Re-collating an ALREADY-populated
 * database therefore requires dropping and recreating the tables (drop → ALTER
 * DATABASE → push), not just running this statement.
 *
 * PRODUCTION USAGE
 * ----------------
 * Run BEFORE `drizzle-kit push`/migrate for a mysql or mariadb DATABASE_DIALECT.
 * The `db:content:push:mysql` npm script chains collation-first:
 *
 *   import { getContentDb } from "@/lib/content/db-factory";
 *   import {
 *     applyMysqlDatabaseCollation,
 *     databaseNameFromUrl,
 *   } from "@/lib/content/mysql-collation";
 *   await applyMysqlDatabaseCollation(
 *     getContentDb(),
 *     databaseNameFromUrl(process.env.DATABASE_URL!)
 *   );
 *   // ...then drizzle-kit push.
 *
 * Idempotent — re-applying the same database default is a no-op.
 */

import { sql } from "drizzle-orm";

/** The byte-exact, case- and accent-sensitive collation the content store pins. */
export const CONTENT_COLLATION = "utf8mb4_bin";
/** The charset that collation belongs to. */
export const CONTENT_CHARSET = "utf8mb4";

/**
 * Minimal structural type for the drizzle mysql executor: just `.execute(sql)`.
 * Kept local so this module does not depend on a concrete drizzle database type.
 */
interface MysqlExecutor {
  execute(query: unknown): Promise<unknown>;
}

/**
 * Mask the `user:password` userinfo of a connection URL before it is interpolated
 * into a log or error message, e.g. `mysql://root:pw@127.0.0.1:3307/db` →
 * `mysql://***@127.0.0.1:3307/db`. Operates on the raw string (not `new URL`) so it
 * still redacts MALFORMED URLs whose userinfo never parsed. URLs without userinfo
 * are returned unchanged.
 */
export function redactDatabaseUrl(databaseUrl: string): string {
  // Replace the whole userinfo — everything between the scheme separator "://"
  // and the LAST "@" before the path — with a fixed mask. Matching to the last
  // "@" (greedy `[^/]*`, which never crosses into the path) ensures a password
  // that itself contains an unencoded "@" is fully masked, not just up to its
  // first "@". A host cannot contain "@", so the final "@" always delimits the
  // userinfo from the host.
  return databaseUrl.replace(/(:\/\/)[^/]*@/, "$1***@");
}

/**
 * Derive the database (schema) name from a MySQL/MariaDB connection URL by
 * reading its path segment, e.g. `mysql://root:pw@127.0.0.1:3307/tintero` →
 * `tintero`. Throws when the URL has no database in its path.
 *
 * Error messages interpolate a CREDENTIAL-REDACTED form of the URL (see
 * `redactDatabaseUrl`) so a leaked DATABASE_URL never exposes its password in logs.
 */
export function databaseNameFromUrl(databaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      `DATABASE_URL is not a valid URL — cannot derive the database name from "${redactDatabaseUrl(databaseUrl)}"`
    );
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!name) {
    throw new Error(
      `DATABASE_URL has no database name in its path — expected mysql://host:port/<db>, got "${redactDatabaseUrl(databaseUrl)}"`
    );
  }
  return name;
}

/**
 * Build the idempotent `ALTER DATABASE ... CHARACTER SET ... COLLATE ...`
 * statement that pins `utf8mb4_bin` as the database default. Backticks in the
 * database name are escaped by doubling, matching MySQL identifier quoting.
 */
export function mysqlDatabaseCollationStatement(dbName: string): string {
  const quoted = `\`${dbName.replace(/`/g, "``")}\``;
  return `ALTER DATABASE ${quoted} CHARACTER SET ${CONTENT_CHARSET} COLLATE ${CONTENT_COLLATION}`;
}

/**
 * Pin `utf8mb4_bin` as the DEFAULT collation of the given database so every table
 * created afterwards inherits case-sensitive identity columns. Idempotent.
 *
 * MUST be called BEFORE the content schema is pushed/migrated — it only affects
 * tables created after it runs (see the module header for the ordering contract).
 */
export async function applyMysqlDatabaseCollation(
  db: MysqlExecutor,
  dbName: string
): Promise<void> {
  await db.execute(sql.raw(mysqlDatabaseCollationStatement(dbName)));
}
