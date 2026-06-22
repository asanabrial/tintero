import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { DrizzleUserAdapter } from "../../../src/lib/auth/drizzle-adapter";
import { getSetupState, isSetupComplete } from "../../../src/lib/install/probes";
import * as schema from "../../../src/lib/auth/schema";
import type { UserRepository } from "../../../src/lib/auth/ports";

// A repo stub whose countAdmins() rejects — only countAdmins is exercised by
// getSetupState, so the rest of the interface is intentionally absent.
function failingRepo(err: Error): UserRepository {
  return {
    async countAdmins(): Promise<number> {
      throw err;
    },
  } as unknown as UserRepository;
}

// DDL mirrors test/lib/auth/helpers.ts exactly.
const CREATE_ENUM_SQL = `
  CREATE TYPE user_role AS ENUM ('admin');
`;

const CREATE_TABLE_SQL = `
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

async function setupMigratedDb(): Promise<DrizzleUserAdapter> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(CREATE_ENUM_SQL);
  await client.exec(CREATE_TABLE_SQL);
  return new DrizzleUserAdapter(db);
}

async function setupBareDb(): Promise<DrizzleUserAdapter> {
  // No DDL — users table does NOT exist; 42P01 will be raised on first query.
  const client = new PGlite();
  const db = drizzle(client, { schema });
  return new DrizzleUserAdapter(db);
}

describe("getSetupState — needs-admin", () => {
  test("migrated DB with zero admins returns 'needs-admin'", async () => {
    const adapter = await setupMigratedDb();
    const state = await getSetupState(adapter);
    expect(state).toBe("needs-admin");
  });

  test("isSetupComplete returns false when no admins", async () => {
    const adapter = await setupMigratedDb();
    expect(await isSetupComplete(adapter)).toBe(false);
  });
});

describe("getSetupState — complete", () => {
  test("after inserting an admin row returns 'complete'", async () => {
    const adapter = await setupMigratedDb();
    await adapter.create({
      email: "admin@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    const state = await getSetupState(adapter);
    expect(state).toBe("complete");
  });

  test("isSetupComplete returns true when an admin exists", async () => {
    const adapter = await setupMigratedDb();
    await adapter.create({
      email: "admin@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    expect(await isSetupComplete(adapter)).toBe(true);
  });
});

describe("getSetupState — schema-not-ready", () => {
  test("PGlite DB without users table returns 'schema-not-ready'", async () => {
    // PGlite raises pg code 42P01 for undefined_table — this IS unit-testable.
    const adapter = await setupBareDb();
    const state = await getSetupState(adapter);
    expect(state).toBe("schema-not-ready");
  });
});

describe("getSetupState — db-unreachable", () => {
  test("a connection error (ECONNREFUSED) returns 'db-unreachable'", async () => {
    const err = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    expect(await getSetupState(failingRepo(err))).toBe("db-unreachable");
  });

  test("a non-42P01 error is classified 'db-unreachable', not 'schema-not-ready'", async () => {
    expect(await getSetupState(failingRepo(new Error("some other failure")))).toBe(
      "db-unreachable"
    );
  });

  test("getSetupState never throws on a rejecting repo", async () => {
    await expect(
      getSetupState(failingRepo(new Error("boom")))
    ).resolves.toBeDefined();
  });
});
