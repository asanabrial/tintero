#!/usr/bin/env bun
/**
 * Backfill CLI — reads content from the filesystem and upserts it into the SQL
 * content database.
 *
 * Usage (from repo root):
 *   bun run backfill [--dry-run]
 *
 * Required environment variables:
 *   CONTENT_ROOT        — path to the content directory (contains posts/ and pages/)
 *   DATABASE_DIALECT    — "postgresql" or "sqlite"
 *   DATABASE_URL        — Postgres connection string (when dialect = postgresql)
 *   DATABASE_FILE       — SQLite file path (when dialect = sqlite; omit for :memory:)
 *
 * Flags:
 *   --dry-run    Compute and print report counts WITHOUT writing to the DB.
 *
 * Follows the same conventions as scripts/user-create.ts:
 *   - Shebang for bun
 *   - Relative imports from ../src/lib (no @/ alias — unavailable outside Next.js)
 *   - All env reads happen inside main(), never at module load
 */

import { FilesystemContentAdapter } from "../src/lib/content/fs-adapter";
import { getContentDb, getContentSchema } from "../src/lib/content/db-factory";
import { runBackfill } from "../src/lib/content/backfill";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "Usage:\n  bun run backfill [--dry-run]\n\n" +
        "Reads content from CONTENT_ROOT and upserts it into the content DB.\n\n" +
        "Required env vars:\n" +
        "  CONTENT_ROOT      — path to the content directory\n" +
        "  DATABASE_DIALECT  — postgresql | sqlite\n" +
        "  DATABASE_URL      — Postgres connection string (postgresql only)\n" +
        "  DATABASE_FILE     — SQLite file path (sqlite only; defaults to :memory:)\n\n" +
        "Flags:\n" +
        "  --dry-run    Preview counts without writing to the DB\n"
    );
    process.exit(0);
  }

  const dryRun = args.includes("--dry-run");

  const contentRoot = process.env.CONTENT_ROOT;
  if (!contentRoot) {
    printError(
      "CONTENT_ROOT is not set — set it to the path of your content directory (the one that contains posts/ and pages/)."
    );
    process.exit(1);
  }

  // Build the filesystem source (oracle) and the DB target
  const source = new FilesystemContentAdapter(contentRoot);

  let db: ReturnType<typeof getContentDb>;
  let schema: ReturnType<typeof getContentSchema>;
  try {
    db = getContentDb();
    schema = getContentSchema();
  } catch (err) {
    printError(String(err));
    process.exit(1);
  }

  process.stdout.write(
    dryRun
      ? "Dry-run mode — no rows will be written.\n"
      : "Starting backfill...\n"
  );

  try {
    const report = await runBackfill({ source, db, schema, dryRun });

    process.stdout.write(
      [
        "",
        "Backfill report:",
        `  posts:         ${report.posts}`,
        `  pages:         ${report.pages}`,
        `  terms:         ${report.terms}`,
        `  relationships: ${report.relationships}`,
        `  meta:          ${report.meta}`,
        "",
        dryRun ? "Dry-run complete — no rows written." : "Backfill complete.",
        "",
      ].join("\n")
    );
    process.exit(0);
  } catch (err) {
    printError(`Backfill failed: ${String(err)}`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
