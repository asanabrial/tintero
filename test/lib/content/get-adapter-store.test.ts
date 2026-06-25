/**
 * Unit tests for the CONTENT_STORE env flag wiring in repository.ts.
 *
 * RED → GREEN cycle for Slice 1E.
 *
 * Covers:
 *   - CONTENT_STORE unset (default) → getAdapter() returns FilesystemContentAdapter
 *   - CONTENT_STORE="fs" explicit → FilesystemContentAdapter
 *   - CONTENT_STORE="db" + DATABASE_DIALECT="sqlite" + DATABASE_FILE=":memory:" → DrizzleContentAdapter
 *   - Unknown CONTENT_STORE value falls back to FilesystemContentAdapter
 *   - Singleton contract: repeated calls return the exact same instance
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FilesystemContentAdapter } from "../../../src/lib/content/fs-adapter";
import { DrizzleContentAdapter } from "../../../src/lib/content/drizzle-adapter";
import {
  getAdapter,
  __resetAdapterForTests,
} from "../../../src/lib/content/repository";
import { __resetForTests as resetDbFactory } from "../../../src/lib/content/db-factory";

// ---------------------------------------------------------------------------
// Env save / restore helpers
// ---------------------------------------------------------------------------

type SavedEnv = {
  CONTENT_STORE: string | undefined;
  DATABASE_DIALECT: string | undefined;
  DATABASE_FILE: string | undefined;
};

let savedEnv: SavedEnv;

beforeEach(() => {
  savedEnv = {
    CONTENT_STORE: process.env.CONTENT_STORE,
    DATABASE_DIALECT: process.env.DATABASE_DIALECT,
    DATABASE_FILE: process.env.DATABASE_FILE,
  };
  delete process.env.CONTENT_STORE;
  delete process.env.DATABASE_DIALECT;
  delete process.env.DATABASE_FILE;
  // Reset both singletons so each test starts from a clean slate.
  __resetAdapterForTests();
  resetDbFactory();
});

afterEach(() => {
  // Restore the original env state.
  if (savedEnv.CONTENT_STORE !== undefined) {
    process.env.CONTENT_STORE = savedEnv.CONTENT_STORE;
  } else {
    delete process.env.CONTENT_STORE;
  }
  if (savedEnv.DATABASE_DIALECT !== undefined) {
    process.env.DATABASE_DIALECT = savedEnv.DATABASE_DIALECT;
  } else {
    delete process.env.DATABASE_DIALECT;
  }
  if (savedEnv.DATABASE_FILE !== undefined) {
    process.env.DATABASE_FILE = savedEnv.DATABASE_FILE;
  } else {
    delete process.env.DATABASE_FILE;
  }
  __resetAdapterForTests();
  resetDbFactory();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CONTENT_STORE flag — adapter selection", () => {
  test("unset → FilesystemContentAdapter (default behavior unchanged)", () => {
    // CONTENT_STORE is deleted in beforeEach — should default to FS adapter.
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(FilesystemContentAdapter);
  });

  test('CONTENT_STORE="fs" → FilesystemContentAdapter', () => {
    process.env.CONTENT_STORE = "fs";
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(FilesystemContentAdapter);
  });

  test('CONTENT_STORE="db" + DATABASE_DIALECT="sqlite" + DATABASE_FILE=":memory:" → DrizzleContentAdapter', () => {
    process.env.CONTENT_STORE = "db";
    process.env.DATABASE_DIALECT = "sqlite";
    process.env.DATABASE_FILE = ":memory:";
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(DrizzleContentAdapter);
  });

  test("singleton: repeated calls with the same env return the exact same instance", () => {
    const first = getAdapter();
    const second = getAdapter();
    expect(second).toBe(first);
  });

  test("unknown CONTENT_STORE value → FilesystemContentAdapter (safe fallback)", () => {
    process.env.CONTENT_STORE = "something_else";
    const adapter = getAdapter();
    expect(adapter).toBeInstanceOf(FilesystemContentAdapter);
  });
});
