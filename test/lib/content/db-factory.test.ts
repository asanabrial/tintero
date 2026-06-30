/**
 * Unit tests for the dialect-selecting content DB factory.
 *
 * Strategy:
 *   - SQLite path: tested fully using libSQL (file::memory:?cache=shared, no server needed).
 *   - PostgreSQL path: only the "missing DATABASE_URL" guard is tested; no live
 *     server is required and none is used.
 *   - mysql / mariadb / unknown / missing dialect: each throws the expected error.
 *
 * Each test case manipulates process.env and calls __resetForTests() to ensure
 * singleton isolation.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __resetForTests,
  getContentDb,
} from "../../../src/lib/content/db-factory";

// ---------------------------------------------------------------------------
// Env save / restore helpers
// ---------------------------------------------------------------------------

type SavedEnv = {
  DATABASE_DIALECT: string | undefined;
  DATABASE_URL: string | undefined;
  DATABASE_FILE: string | undefined;
};

let savedEnv: SavedEnv;

beforeEach(() => {
  savedEnv = {
    DATABASE_DIALECT: process.env.DATABASE_DIALECT,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_FILE: process.env.DATABASE_FILE,
  };
  // Clean slate before each test
  delete process.env.DATABASE_DIALECT;
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_FILE;
  // Reset the singleton so each test starts fresh
  __resetForTests();
});

afterEach(() => {
  // Restore whatever was there before
  if (savedEnv.DATABASE_DIALECT !== undefined) {
    process.env.DATABASE_DIALECT = savedEnv.DATABASE_DIALECT;
  } else {
    delete process.env.DATABASE_DIALECT;
  }
  if (savedEnv.DATABASE_URL !== undefined) {
    process.env.DATABASE_URL = savedEnv.DATABASE_URL;
  } else {
    delete process.env.DATABASE_URL;
  }
  if (savedEnv.DATABASE_FILE !== undefined) {
    process.env.DATABASE_FILE = savedEnv.DATABASE_FILE;
  } else {
    delete process.env.DATABASE_FILE;
  }
  __resetForTests();
});

// ---------------------------------------------------------------------------
// SQLite path — in-memory (no DATABASE_FILE set)
// ---------------------------------------------------------------------------

describe("sqlite dialect — :memory: path", () => {
  test("returns a drizzle instance when DATABASE_DIALECT=sqlite and DATABASE_FILE is unset", () => {
    process.env.DATABASE_DIALECT = "sqlite";
    const db = getContentDb();
    expect(db).not.toBeNull();
    expect(db).not.toBeUndefined();
    // A real drizzle instance exposes query builder methods
    expect(typeof db.select).toBe("function");
    expect(typeof db.insert).toBe("function");
  });

  test("second call returns the SAME instance (singleton)", () => {
    process.env.DATABASE_DIALECT = "sqlite";
    const first = getContentDb();
    const second = getContentDb();
    expect(second).toBe(first);
  });

  test("accepts explicit :memory: as DATABASE_FILE", () => {
    process.env.DATABASE_DIALECT = "sqlite";
    process.env.DATABASE_FILE = ":memory:";
    const db = getContentDb();
    expect(db).not.toBeNull();
    expect(typeof db.select).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// PostgreSQL path — guard only (no live server)
// ---------------------------------------------------------------------------

describe("postgresql dialect — missing DATABASE_URL guard", () => {
  test("throws with DATABASE_URL in the message when DATABASE_URL is not set", () => {
    process.env.DATABASE_DIALECT = "postgresql";
    // DATABASE_URL is intentionally not set (cleaned in beforeEach)
    expect(() => getContentDb()).toThrow("DATABASE_URL");
  });
});

// ---------------------------------------------------------------------------
// Unsupported dialects (v1 scope: Postgres + SQLite only)
// ---------------------------------------------------------------------------

describe("mysql dialect — not supported in v1", () => {
  test("throws a 'not supported in v1' error", () => {
    process.env.DATABASE_DIALECT = "mysql";
    expect(() => getContentDb()).toThrow("not supported in v1");
  });
});

describe("mariadb dialect — not supported in v1", () => {
  test("throws a 'not supported in v1' error", () => {
    process.env.DATABASE_DIALECT = "mariadb";
    expect(() => getContentDb()).toThrow("not supported in v1");
  });
});

// ---------------------------------------------------------------------------
// Unknown or missing dialect
// ---------------------------------------------------------------------------

describe("unknown dialect — throws with valid values listed", () => {
  test("unrecognized string throws and lists valid values", () => {
    process.env.DATABASE_DIALECT = "oracle";
    expect(() => getContentDb()).toThrow("postgresql");
  });

  test("missing DATABASE_DIALECT throws and lists valid values", () => {
    // DATABASE_DIALECT is not set (cleaned in beforeEach)
    expect(() => getContentDb()).toThrow("DATABASE_DIALECT");
  });
});
