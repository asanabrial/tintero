#!/usr/bin/env bun
/**
 * Post-push collation hardening for the MySQL/MariaDB content store.
 *
 * drizzle-orm 0.45.2's mysql-core varchar() builder cannot express per-column
 * collation, so `drizzle-kit push` (db:content:push:mysql) creates the identity
 * columns with MySQL's case-INsensitive default collation. That diverges from the
 * sqlite/pg dialects, which treat slugs case-sensitively. This script pins
 * utf8mb4_bin on the identity/FK/key columns to restore parity.
 *
 * Run AFTER the push (the db:content:push:mysql npm script chains it):
 *   DATABASE_DIALECT=mysql DATABASE_URL=mysql://… bun run scripts/apply-mysql-collation.ts
 *
 * Requires DATABASE_DIALECT ∈ { mysql, mariadb } and DATABASE_URL set. Idempotent.
 *
 * Relative imports (no @/ alias — not available outside Next.js), mirroring the
 * other files in scripts/.
 */

import { getContentDb } from "../src/lib/content/db-factory";
import { applyMysqlIdentityCollation } from "../src/lib/content/mysql-collation";

async function main(): Promise<void> {
  const dialect = (process.env.DATABASE_DIALECT ?? "").toLowerCase();
  if (dialect !== "mysql" && dialect !== "mariadb") {
    throw new Error(
      `DATABASE_DIALECT must be "mysql" or "mariadb" to apply this collation override (got "${process.env.DATABASE_DIALECT ?? ""}")`
    );
  }
  const db = getContentDb();
  await applyMysqlIdentityCollation(db);
  // eslint-disable-next-line no-console
  console.log("Applied utf8mb4_bin collation to content-store identity columns.");
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to apply MySQL identity collation:", err);
  process.exit(1);
});
