/**
 * Dialect-dispatch unit tests for src/lib/content/db-upsert.ts.
 *
 * These tests prove the BRANCHING logic of the three helpers without a live DB
 * (no in-process MySQL exists). A fake `exec` records every query-builder method
 * call and resolves awaited chains via a thenable, so we can assert WHICH driver
 * API each helper drives per `DATABASE_DIALECT`:
 *
 *   - sqlite / postgresql → ON CONFLICT family
 *       (onConflictDoUpdate / onConflictDoNothing / returning)
 *   - mysql / mariadb      → onDuplicateKeyUpdate (+ a follow-up SELECT for the
 *       returning-id helper, since MySQL has no RETURNING)
 *
 * The existing content suite (run on sqlite/pg) proves end-to-end behavior
 * preservation; this file isolates the MySQL branch that nothing else exercises.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  insertIgnore,
  upsert,
  upsertReturningId,
} from "../../../src/lib/content/db-upsert";
import * as schema from "../../../src/lib/content/schema.sqlite";

// ---------------------------------------------------------------------------
// Mock executor — records calls; every method returns the same chainable object
// which is also a thenable resolving to a fixed id row, so `await chain` works.
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface MockExec {
  calls: RecordedCall[];
  methods(): string[];
  callsOf(method: string): RecordedCall[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function makeMockExec(resolveValue: unknown = [{ id: "live-id" }]): MockExec {
  const calls: RecordedCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return exec;
    };

  const exec = {
    calls,
    methods: () => calls.map((c) => c.method),
    callsOf: (method: string) => calls.filter((c) => c.method === method),
    insert: record("insert"),
    values: record("values"),
    onConflictDoUpdate: record("onConflictDoUpdate"),
    onConflictDoNothing: record("onConflictDoNothing"),
    onDuplicateKeyUpdate: record("onDuplicateKeyUpdate"),
    returning: record("returning"),
    select: record("select"),
    from: record("from"),
    where: record("where"),
    limit: record("limit"),
    // Thenable: any awaited chain resolves to the configured value.
    then: (resolve: (v: unknown) => void) => resolve(resolveValue),
  } as unknown as MockExec;

  return exec;
}

// Minimal stand-ins for drizzle Column / SQL objects. The helpers only pass
// these through to the (mocked) query builder, except insertIgnore's mysql path
// which reads `selfRefColumn.name`.
const fakeColumn = (name: string) => ({ name }) as never;
const fakeSql = { __sql: true } as never;

const ON_CONFLICT_OPTS = {
  conflictTarget: [fakeColumn("taxonomy"), fakeColumn("slug")],
  targetWhere: fakeSql,
  updateSet: { label: "x", updated_at: 1 },
};

afterEach(() => {
  delete process.env.DATABASE_DIALECT;
});

describe("upsertReturningId — dialect dispatch", () => {
  for (const dialect of ["sqlite", "postgresql"] as const) {
    test(`${dialect}: uses onConflictDoUpdate + returning`, async () => {
      process.env.DATABASE_DIALECT = dialect;
      const exec = makeMockExec();

      const id = await upsertReturningId(
        exec,
        {},
        { id: "client-id" },
        {
          ...ON_CONFLICT_OPTS,
          idColumn: fakeColumn("id"),
          naturalKeyWhere: fakeSql,
        }
      );

      expect(id).toBe("live-id");
      expect(exec.methods()).toEqual([
        "insert",
        "values",
        "onConflictDoUpdate",
        "returning",
      ]);
      // No MySQL API and no follow-up SELECT on the standard path.
      expect(exec.methods()).not.toContain("onDuplicateKeyUpdate");
      expect(exec.methods()).not.toContain("select");
    });
  }

  for (const dialect of ["mysql", "mariadb"] as const) {
    test(`${dialect}: uses onDuplicateKeyUpdate + SELECT (no RETURNING)`, async () => {
      process.env.DATABASE_DIALECT = dialect;
      const exec = makeMockExec();

      const id = await upsertReturningId(
        exec,
        {},
        { id: "client-id" },
        {
          ...ON_CONFLICT_OPTS,
          idColumn: fakeColumn("id"),
          naturalKeyWhere: fakeSql,
        }
      );

      expect(id).toBe("live-id");
      expect(exec.methods()).toEqual([
        "insert",
        "values",
        "onDuplicateKeyUpdate",
        "select",
        "from",
        "where",
        "limit",
      ]);
      // The MySQL path must NOT touch the ON CONFLICT / RETURNING API.
      expect(exec.methods()).not.toContain("onConflictDoUpdate");
      expect(exec.methods()).not.toContain("returning");
    });
  }

  test("mysql: throws a CLEAR domain error (not a TypeError) when the natural-key SELECT returns no row", async () => {
    process.env.DATABASE_DIALECT = "mysql";
    // SELECT resolves to [] → rows[0] is undefined. The guard must convert the
    // would-be `TypeError: cannot read 'id' of undefined` into a clear domain error.
    const exec = makeMockExec([]);

    let caught: unknown;
    try {
      await upsertReturningId(exec, schema.terms, { id: "client-id" }, {
        ...ON_CONFLICT_OPTS,
        idColumn: fakeColumn("id"),
        naturalKeyWhere: fakeSql,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    // Must NOT be the raw TypeError from dereferencing undefined.
    expect(caught).not.toBeInstanceOf(TypeError);
    const message = (caught as Error).message;
    // Names the table and explains the natural key matched no row.
    expect(message).toContain("terms");
    expect(message).toMatch(/no row/i);
    expect(message).toMatch(/natural key/i);
  });
});

describe("upsert — dialect dispatch", () => {
  for (const dialect of ["sqlite", "postgresql"] as const) {
    test(`${dialect}: uses onConflictDoUpdate, no returning`, async () => {
      process.env.DATABASE_DIALECT = dialect;
      const exec = makeMockExec();

      await upsert(exec, {}, { id: "x" }, ON_CONFLICT_OPTS);

      expect(exec.methods()).toEqual([
        "insert",
        "values",
        "onConflictDoUpdate",
      ]);
      expect(exec.methods()).not.toContain("returning");
      expect(exec.methods()).not.toContain("onDuplicateKeyUpdate");
    });
  }

  for (const dialect of ["mysql", "mariadb"] as const) {
    test(`${dialect}: uses onDuplicateKeyUpdate`, async () => {
      process.env.DATABASE_DIALECT = dialect;
      const exec = makeMockExec();

      await upsert(exec, {}, { id: "x" }, ON_CONFLICT_OPTS);

      expect(exec.methods()).toEqual([
        "insert",
        "values",
        "onDuplicateKeyUpdate",
      ]);
      // Same update set is forwarded to the MySQL builder.
      expect(exec.callsOf("onDuplicateKeyUpdate")[0].args[0]).toEqual({
        set: ON_CONFLICT_OPTS.updateSet,
      });
      expect(exec.methods()).not.toContain("onConflictDoUpdate");
    });
  }
});

describe("insertIgnore — dialect dispatch", () => {
  for (const dialect of ["sqlite", "postgresql"] as const) {
    test(`${dialect}: uses onConflictDoNothing`, async () => {
      process.env.DATABASE_DIALECT = dialect;
      const exec = makeMockExec();

      await insertIgnore(
        exec,
        {},
        { content_id: "c", term_id: "t" },
        { selfRefColumn: fakeColumn("content_id") }
      );

      expect(exec.methods()).toEqual([
        "insert",
        "values",
        "onConflictDoNothing",
      ]);
      expect(exec.methods()).not.toContain("onDuplicateKeyUpdate");
    });
  }

  for (const dialect of ["mysql", "mariadb"] as const) {
    test(`${dialect}: uses onDuplicateKeyUpdate with a self-ref no-op set`, async () => {
      process.env.DATABASE_DIALECT = dialect;
      const exec = makeMockExec();

      await insertIgnore(
        exec,
        {},
        { content_id: "c", term_id: "t" },
        { selfRefColumn: fakeColumn("content_id") }
      );

      expect(exec.methods()).toEqual([
        "insert",
        "values",
        "onDuplicateKeyUpdate",
      ]);
      // The no-op set keys the self-ref column by its name.
      const setArg = exec.callsOf("onDuplicateKeyUpdate")[0].args[0] as {
        set: Record<string, unknown>;
      };
      expect(Object.keys(setArg.set)).toEqual(["content_id"]);
      expect(exec.methods()).not.toContain("onConflictDoNothing");
    });
  }
});

describe("dialect default", () => {
  test("unset DATABASE_DIALECT falls back to the sqlite/pg path", async () => {
    delete process.env.DATABASE_DIALECT;
    const exec = makeMockExec();

    await upsert(exec, {}, { id: "x" }, ON_CONFLICT_OPTS);

    expect(exec.methods()).toContain("onConflictDoUpdate");
    expect(exec.methods()).not.toContain("onDuplicateKeyUpdate");
  });
});
