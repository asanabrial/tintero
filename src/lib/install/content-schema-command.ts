/**
 * Returns the shell command an operator must run to push the content-layer
 * schema when CONTENT_STORE=db is selected, or null when no extra step is
 * needed (filesystem installs or an unrecognised/missing dialect).
 *
 * Dialect behaviour for db + unknown/missing dialect:
 *   Returns null rather than guessing.  The db-factory already rejects
 *   anything other than "postgresql" | "sqlite", so surfacing a command
 *   for an unsupported dialect would be misleading — the operator needs
 *   to fix DATABASE_DIALECT in their env config first.
 */
export function contentSchemaPushCommand(
  contentStore: string | undefined,
  dialect: string | undefined
): string | null {
  if (contentStore !== "db") {
    return null;
  }

  if (dialect === "postgresql") {
    return "bun run db:content:push:pg";
  }

  if (dialect === "sqlite") {
    return "bun run db:content:push:sqlite";
  }

  return null;
}
