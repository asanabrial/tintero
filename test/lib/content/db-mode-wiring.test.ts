/**
 * Regression test for DB-mode (CONTENT_STORE=db) adapter/writer wiring.
 *
 * BACKGROUND
 * ----------
 * `CONTENT_STORE=db` selects the Drizzle DB-backed content store. The read path
 * (`getAdapter`) and the write paths (`getWriter`/`getPageWriter`) must resolve
 * and construct the Drizzle implementations. A prior bug loaded these modules via
 * `require()` lazily; under the Next.js/Turbopack server runtime that returned a
 * broken/empty module (`getContentDb`/`DrizzleContentAdapter`/`DrizzleContentWriter`
 * undefined), so every DB-mode route 500'd and the multi-dialect store was
 * unreachable from the running app. The fix loads the adapters/writers via static
 * imports and lazy-loads only the native DB driver per dialect inside db-factory.
 *
 * This test locks the dispatch + constructibility: in db mode the factories must
 * return the Drizzle implementations (not the filesystem ones) and must not throw.
 * It uses DATABASE_DIALECT=sqlite (in-memory libSQL) so no live server is needed.
 *
 * NOTE: bun's `require()` handles ESM, so this test cannot reproduce the
 * Turbopack-specific module-eval failure itself; it guards against the wiring
 * regressing (wrong adapter returned, import removed, factory throwing).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getAdapter,
  __resetAdapterForTests,
} from "../../../src/lib/content/repository";
import { getWriter, getPageWriter } from "../../../src/lib/content/index";
import { __resetForTests } from "../../../src/lib/content/db-factory";

type Saved = {
  CONTENT_STORE: string | undefined;
  DATABASE_DIALECT: string | undefined;
  DATABASE_FILE: string | undefined;
};

let saved: Saved;

beforeEach(() => {
  saved = {
    CONTENT_STORE: process.env.CONTENT_STORE,
    DATABASE_DIALECT: process.env.DATABASE_DIALECT,
    DATABASE_FILE: process.env.DATABASE_FILE,
  };
  __resetAdapterForTests();
  __resetForTests();
  process.env.CONTENT_STORE = "db";
  process.env.DATABASE_DIALECT = "sqlite";
  // in-memory libSQL (resolved by db-factory) — no server required
  delete process.env.DATABASE_FILE;
});

afterEach(() => {
  for (const key of ["CONTENT_STORE", "DATABASE_DIALECT", "DATABASE_FILE"] as const) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __resetAdapterForTests();
  __resetForTests();
});

describe("CONTENT_STORE=db wiring", () => {
  test("getAdapter() returns the Drizzle read adapter (not the filesystem one)", () => {
    const adapter = getAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.constructor.name).toBe("DrizzleContentAdapter");
  });

  test("getWriter() returns the Drizzle post writer", () => {
    const writer = getWriter();
    expect(writer.constructor.name).toBe("DrizzleContentWriter");
  });

  test("getPageWriter() returns the Drizzle page writer", () => {
    const writer = getPageWriter();
    expect(writer.constructor.name).toBe("DrizzlePageWriter");
  });

  test("default (CONTENT_STORE unset) still returns the filesystem adapter", () => {
    delete process.env.CONTENT_STORE;
    __resetAdapterForTests();
    const adapter = getAdapter();
    expect(adapter.constructor.name).toBe("FilesystemContentAdapter");
  });
});
