#!/usr/bin/env bun
/**
 * Pre-push collation hardening for the MySQL/MariaDB content store.
 *
 * MySQL/MariaDB default to a case-INsensitive collation, which diverges from the
 * sqlite/pg dialects that treat slugs case-sensitively. This script pins
 * utf8mb4_bin as the DATABASE default so that every table `drizzle-kit push`
 * creates afterwards inherits case-sensitive identity columns — restoring parity
 * without any per-column ALTER (which MariaDB refuses on FK columns; see
 * src/lib/content/mysql-collation.ts).
 *
 * ORDERING: this MUST run BEFORE the push. `ALTER DATABASE ... COLLATE` only
 * changes the default applied to NEWLY created tables; it does not re-collate
 * tables that already exist. The db:content:push:mysql npm script runs this
 * first, then pushes:
 *   DATABASE_DIALECT=mysql DATABASE_URL=mysql://… bun run scripts/apply-mysql-collation.ts
 *
 * Requires DATABASE_DIALECT ∈ { mysql, mariadb } and DATABASE_URL set. Idempotent.
 *
 * Relative imports (no @/ alias — not available outside Next.js), mirroring the
 * other files in scripts/.
 */

import { getContentDb } from "../src/lib/content/db-factory";
import {
  applyMysqlDatabaseCollation,
  databaseNameFromUrl,
} from "../src/lib/content/mysql-collation";

async function main(): Promise<void> {
  const dialect = (process.env.DATABASE_DIALECT ?? "").toLowerCase();
  if (dialect !== "mysql" && dialect !== "mariadb") {
    throw new Error(
      `DATABASE_DIALECT must be "mysql" or "mariadb" to apply this collation override (got "${process.env.DATABASE_DIALECT ?? ""}")`
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set — point it at the MySQL/MariaDB database to harden"
    );
  }
  const dbName = databaseNameFromUrl(databaseUrl);
  const db = getContentDb();
  await applyMysqlDatabaseCollation(db, dbName);
  // eslint-disable-next-line no-console
  console.log(
    `Set ${dbName} default collation to utf8mb4_bin (run BEFORE drizzle-kit push).`
  );
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to apply MySQL database collation:", err);
  process.exit(1);
});
