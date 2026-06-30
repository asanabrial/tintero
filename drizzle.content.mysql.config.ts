// Content-schema drizzle-kit config for MySQL / MariaDB.
// Covers only the content layer tables (content, terms, term_relationships, content_meta).
// Use `bun run db:content:push:mysql` to sync the content schema to a MySQL/MariaDB database.
// DATABASE_URL must be set (see .env.example).
const config = {
  schema: "./src/lib/content/schema.mysql.ts",
  dialect: "mysql",
  dbCredentials: { url: process.env.DATABASE_URL! },
};

export default config;
