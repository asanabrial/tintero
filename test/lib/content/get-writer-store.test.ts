/**
 * Unit tests for the CONTENT_STORE env flag wiring in index.ts writer factories.
 *
 * RED → GREEN cycle (Phase 5, Slice D).
 *
 * Covers:
 *   - CONTENT_STORE unset (default) → getWriter() returns FsContentWriter,
 *     getPageWriter() returns FsPageWriter
 *   - CONTENT_STORE="fs" explicit → FsContentWriter / FsPageWriter
 *   - CONTENT_STORE="db" + DATABASE_DIALECT="sqlite" + DATABASE_FILE=":memory:"
 *     → DrizzleContentWriter / DrizzlePageWriter
 *   - Unknown CONTENT_STORE value falls back to FsContentWriter / FsPageWriter
 *
 * Mirror of get-adapter-store.test.ts for the write path.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FsContentWriter } from "../../../src/lib/content/fs-writer";
import { FsPageWriter } from "../../../src/lib/content/fs-page-writer";
import { DrizzleContentWriter } from "../../../src/lib/content/drizzle-content-writer";
import { DrizzlePageWriter } from "../../../src/lib/content/drizzle-page-writer";
import { getWriter, getPageWriter } from "../../../src/lib/content/index";
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
  // Reset the db-factory singleton so each test starts from a clean state.
  // Writers are constructed fresh on each call (no singleton at the writer level)
  // so only the db singleton needs resetting.
  resetDbFactory();
});

afterEach(() => {
  // Restore original env state.
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
  resetDbFactory();
});

// ---------------------------------------------------------------------------
// Tests — getWriter()
// ---------------------------------------------------------------------------

describe("CONTENT_STORE flag — getWriter() selection", () => {
  test("unset → FsContentWriter (default behavior unchanged)", () => {
    // CONTENT_STORE is deleted in beforeEach — should default to FS writer.
    const writer = getWriter();
    expect(writer).toBeInstanceOf(FsContentWriter);
  });

  test('CONTENT_STORE="fs" → FsContentWriter', () => {
    process.env.CONTENT_STORE = "fs";
    const writer = getWriter();
    expect(writer).toBeInstanceOf(FsContentWriter);
  });

  test('CONTENT_STORE="db" + DATABASE_DIALECT="sqlite" + DATABASE_FILE=":memory:" → DrizzleContentWriter', () => {
    process.env.CONTENT_STORE = "db";
    process.env.DATABASE_DIALECT = "sqlite";
    process.env.DATABASE_FILE = ":memory:";
    const writer = getWriter();
    expect(writer).toBeInstanceOf(DrizzleContentWriter);
  });

  test("unknown CONTENT_STORE value → FsContentWriter (safe fallback)", () => {
    process.env.CONTENT_STORE = "something_else";
    const writer = getWriter();
    expect(writer).toBeInstanceOf(FsContentWriter);
  });
});

// ---------------------------------------------------------------------------
// Tests — getPageWriter()
// ---------------------------------------------------------------------------

describe("CONTENT_STORE flag — getPageWriter() selection", () => {
  test("unset → FsPageWriter (default behavior unchanged)", () => {
    // CONTENT_STORE is deleted in beforeEach — should default to FS page writer.
    const writer = getPageWriter();
    expect(writer).toBeInstanceOf(FsPageWriter);
  });

  test('CONTENT_STORE="fs" → FsPageWriter', () => {
    process.env.CONTENT_STORE = "fs";
    const writer = getPageWriter();
    expect(writer).toBeInstanceOf(FsPageWriter);
  });

  test('CONTENT_STORE="db" + DATABASE_DIALECT="sqlite" + DATABASE_FILE=":memory:" → DrizzlePageWriter', () => {
    process.env.CONTENT_STORE = "db";
    process.env.DATABASE_DIALECT = "sqlite";
    process.env.DATABASE_FILE = ":memory:";
    const writer = getPageWriter();
    expect(writer).toBeInstanceOf(DrizzlePageWriter);
  });

  test("unknown CONTENT_STORE value → FsPageWriter (safe fallback)", () => {
    process.env.CONTENT_STORE = "something_else";
    const writer = getPageWriter();
    expect(writer).toBeInstanceOf(FsPageWriter);
  });
});
