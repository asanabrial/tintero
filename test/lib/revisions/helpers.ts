import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { DrizzleRevisionAdapter } from "../../../src/lib/revisions/drizzle-adapter";
import * as schema from "../../../src/lib/revisions/schema";

// DDL must be applied manually because drizzle-kit push is not available in tests.
// The SQL mirrors the pgTable/pgEnum definition in schema.ts exactly.
export const CREATE_ENUM_SQL = `
  CREATE TYPE revision_source AS ENUM ('admin', 'api', 'cli', 'wizard');
`;

export const CREATE_TABLE_SQL = `
  CREATE TABLE post_revisions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL,
    slug         TEXT NOT NULL,
    raw_content  TEXT NOT NULL,
    source       revision_source NOT NULL,
    author_id    TEXT,
    author_label TEXT,
    sequence     SERIAL NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

export interface TestContext {
  db: ReturnType<typeof drizzle>;
  adapter: DrizzleRevisionAdapter;
}

export async function setupDb(): Promise<TestContext> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(CREATE_ENUM_SQL);
  await client.exec(CREATE_TABLE_SQL);
  const adapter = new DrizzleRevisionAdapter(db);
  return { db, adapter };
}
