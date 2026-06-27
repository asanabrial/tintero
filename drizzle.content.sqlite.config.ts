// Content-schema drizzle-kit config for SQLite.
// Covers only the content layer tables (content, terms, term_relationships, content_meta).
// Use `bun run db:content:push:sqlite` to sync the content schema to an SQLite database.
// DATABASE_FILE must be set (see .env.example); defaults to ":memory:" in the app
// but drizzle-kit push requires a real file path (not ":memory:").
const config = {
  schema: "./src/lib/content/schema.sqlite.ts",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_FILE! },
};

export default config;
