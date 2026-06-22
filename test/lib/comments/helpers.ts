import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { DrizzleCommentAdapter } from "../../../src/lib/comments/drizzle-adapter";
import * as schema from "../../../src/lib/comments/schema";

// DDL must be applied manually because drizzle-kit push is not available in tests.
// The SQL mirrors the pgTable/pgEnum definition in schema.ts exactly.
export const CREATE_ENUM_SQL = `
  CREATE TYPE comment_status AS ENUM ('pending', 'approved', 'spam', 'trash');
`;

export const CREATE_TABLE_SQL = `
  CREATE TABLE comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_slug   TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT NOT NULL,
    author_url  TEXT,
    body        TEXT NOT NULL,
    status      comment_status NOT NULL,
    parent_id   UUID REFERENCES comments(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_comments_post_slug_status ON comments (post_slug, status);
  CREATE INDEX idx_comments_parent_id ON comments (parent_id);
  CREATE INDEX idx_comments_status_created_at ON comments (status, created_at);
`;

export interface TestContext {
  db: ReturnType<typeof drizzle>;
  adapter: DrizzleCommentAdapter;
}

export async function setupDb(): Promise<TestContext> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(CREATE_ENUM_SQL);
  await client.exec(CREATE_TABLE_SQL);
  const adapter = new DrizzleCommentAdapter(db);
  return { db, adapter };
}
