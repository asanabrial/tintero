// Lazy singleton factory for the production UserRepository.
// Reads DATABASE_URL on first call; throws synchronously if missing.
// Module import NEVER touches process.env or DB — safe at build time.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DrizzleUserAdapter } from "./drizzle-adapter";
import type { UserRepository } from "./ports";
import * as schema from "./schema";

let repository: UserRepository | null = null;

/**
 * Returns the singleton UserRepository backed by a pg.Pool + drizzle.
 * Lazy: pool is created on first call.
 * Throws synchronously with a human-readable message if DATABASE_URL is missing.
 */
export function getUserRepository(): UserRepository {
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
  repository = new DrizzleUserAdapter(db);
  return repository;
}
