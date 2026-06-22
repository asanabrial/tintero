import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { DrizzleUserAdapter } from "../../../src/lib/auth/drizzle-adapter";
import * as schema from "../../../src/lib/auth/schema";

// DDL must be applied manually because drizzle-kit push is not available in tests.
// The SQL mirrors the pgTable/pgEnum definition in schema.ts exactly.
export const CREATE_ENUM_SQL = `
  CREATE TYPE user_role AS ENUM ('admin', 'editor', 'author');
`;

export const CREATE_TABLE_SQL = `
  CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          user_role NOT NULL DEFAULT 'admin',
    name          TEXT,
    bio           TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

export interface TestContext {
  db: ReturnType<typeof drizzle>;
  adapter: DrizzleUserAdapter;
}

export async function setupDb(): Promise<TestContext> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(CREATE_ENUM_SQL);
  await client.exec(CREATE_TABLE_SQL);
  const adapter = new DrizzleUserAdapter(db);
  return { db, adapter };
}
