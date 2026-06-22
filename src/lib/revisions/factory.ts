// Lazy singleton factory for the production RevisionRepository.
// Reads DATABASE_URL on first call; throws synchronously if missing.
// Module import NEVER touches process.env or DB — safe at build time.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DrizzleRevisionAdapter } from "./drizzle-adapter";
import type { RevisionRepository } from "./ports";
import * as schema from "./schema";

let repository: RevisionRepository | null = null;

/**
 * Returns the singleton RevisionRepository backed by a pg.Pool + drizzle.
 * Lazy: pool is created on first call.
 * Throws synchronously with a human-readable message if DATABASE_URL is missing.
 */
export function getRevisionRepository(): RevisionRepository {
  if (repository !== null) {
    return repository;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set — copy .env.example to .env.local and point it at a Postgres instance"
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  repository = new DrizzleRevisionAdapter(db);
  return repository;
}
