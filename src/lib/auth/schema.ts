import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// user_role postgres enum: admin, editor, author
// DEFERRED-DEPLOY: drizzle-kit push requires DATABASE_URL; run at deploy time.
export const userRole = pgEnum("user_role", ["admin", "editor", "author"]);

// users table — canonical schema for Drizzle push
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("admin"),
  // Optional public profile fields (WordPress parity). Nullable so existing rows
  // and pre-profile users remain valid; never exposes the email when set.
  name: text("name"),
  bio: text("bio"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
