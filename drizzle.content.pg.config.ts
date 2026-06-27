// Content-schema drizzle-kit config for PostgreSQL.
// Covers only the content layer tables (content, terms, term_relationships, content_meta).
// Use `bun run db:content:push:pg` to sync the content schema to a Postgres database.
// DATABASE_URL must be set (see .env.example).
const config = {
  schema: "./src/lib/content/schema.pg.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
};

export default config;
