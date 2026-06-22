// Drizzle Kit configuration for the comments feature.
// Use `bunx drizzle-kit push` to sync schema to the database.
// Satisfies: REQ-ENV-03, REQ-DB-05.
const config = {
  schema: ["./src/lib/comments/schema.ts", "./src/lib/auth/schema.ts", "./src/lib/revisions/schema.ts"],
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
};

export default config;
