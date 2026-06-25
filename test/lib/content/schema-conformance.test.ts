/**
 * Schema conformance test — dialect drift detection.
 *
 * Purpose: assert that schema.pg.ts and schema.sqlite.ts always define the same
 * tables with the same column names and logical types. A divergence here means the
 * two dialects will behave differently at runtime — this test catches that
 * statically, without any database connection.
 *
 * Approach: introspect the actual Drizzle table objects via `getTableColumns` from
 * `drizzle-orm` and compare them against the single-source-of-truth descriptor in
 * schema-descriptor.ts.
 */
import { describe, expect, test } from "bun:test";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig as pgGetTableConfig } from "drizzle-orm/pg-core";
import { getTableConfig as sqliteGetTableConfig } from "drizzle-orm/sqlite-core";
import {
  SCHEMA_DESCRIPTOR,
  type LogicalType,
} from "../../../src/lib/content/schema-descriptor";
import * as pgSchema from "../../../src/lib/content/schema.pg";
import * as sqliteSchema from "../../../src/lib/content/schema.sqlite";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

type DrizzleColumnLike = { dataType: string; notNull: boolean };

// pg and sqlite table objects are different types at the import boundary but share
// the same runtime structure — cast once here rather than at every call site.
type AnyDrizzleTable = Parameters<typeof getTableColumns>[0];

function getPgCols(tableName: keyof typeof pgSchema) {
  return getTableColumns(pgSchema[tableName] as AnyDrizzleTable);
}

function getSqliteCols(tableName: keyof typeof sqliteSchema) {
  return getTableColumns(sqliteSchema[tableName] as AnyDrizzleTable);
}

function toLogicalType(col: DrizzleColumnLike): LogicalType {
  if (col.dataType === "string") {
    return col.notNull ? "text" : "text-null";
  }
  if (col.dataType === "number") {
    return col.notNull ? "integer" : "integer-null";
  }
  throw new Error(
    `Unexpected Drizzle column dataType "${col.dataType}" — update the descriptor type map if a new type was intentionally added.`
  );
}

// ------------------------------------------------------------------
// Unit tests for toLogicalType — covers all four logical type paths.
// These run before the schema tests so a broken helper is caught first.
// ------------------------------------------------------------------

describe("toLogicalType helper", () => {
  test("string + notNull=true → 'text'", () => {
    expect(toLogicalType({ dataType: "string", notNull: true })).toBe("text");
  });

  test("string + notNull=false → 'text-null'", () => {
    expect(toLogicalType({ dataType: "string", notNull: false })).toBe(
      "text-null"
    );
  });

  test("number + notNull=true → 'integer'", () => {
    expect(toLogicalType({ dataType: "number", notNull: true })).toBe(
      "integer"
    );
  });

  test("number + notNull=false → 'integer-null'", () => {
    expect(toLogicalType({ dataType: "number", notNull: false })).toBe(
      "integer-null"
    );
  });

  test("unexpected dataType throws a descriptive error", () => {
    expect(() =>
      toLogicalType({ dataType: "boolean", notNull: true })
    ).toThrow("Unexpected Drizzle column dataType");
  });
});

// ------------------------------------------------------------------
// Derive the table names from the descriptor (single source of truth)
// ------------------------------------------------------------------

const tableNames = Object.keys(SCHEMA_DESCRIPTOR) as Array<
  keyof typeof SCHEMA_DESCRIPTOR
>;

// ------------------------------------------------------------------
// Top-level guard: both files must export exactly the same tables
// ------------------------------------------------------------------

describe("schema conformance — dialect drift detection", () => {
  test("pg schema exports all tables in the descriptor (no extras, no missing)", () => {
    const pgTableNames = Object.keys(pgSchema).sort();
    const expected = [...tableNames].sort();
    expect(pgTableNames).toEqual(expected);
  });

  test("sqlite schema exports all tables in the descriptor (no extras, no missing)", () => {
    const sqliteTableNames = Object.keys(sqliteSchema).sort();
    const expected = [...tableNames].sort();
    expect(sqliteTableNames).toEqual(expected);
  });

  // ------------------------------------------------------------------
  // Per-table checks
  // ------------------------------------------------------------------

  for (const tableName of tableNames) {
    const descriptor = SCHEMA_DESCRIPTOR[tableName];

    describe(`table "${tableName}"`, () => {
      test("pg: column names match descriptor", () => {
        const cols = getPgCols(tableName);
        expect(Object.keys(cols).sort()).toEqual(
          Object.keys(descriptor.columns).sort()
        );
      });

      test("sqlite: column names match descriptor", () => {
        const cols = getSqliteCols(tableName);
        expect(Object.keys(cols).sort()).toEqual(
          Object.keys(descriptor.columns).sort()
        );
      });

      test("pg: column logical types match descriptor", () => {
        const cols = getPgCols(tableName);
        for (const [colName, expectedType] of Object.entries(
          descriptor.columns
        )) {
          const col = cols[colName] as DrizzleColumnLike | undefined;
          expect(col).toBeDefined();
          expect(toLogicalType(col!)).toBe(expectedType);
        }
      });

      test("sqlite: column logical types match descriptor", () => {
        const cols = getSqliteCols(tableName);
        for (const [colName, expectedType] of Object.entries(
          descriptor.columns
        )) {
          const col = cols[colName] as DrizzleColumnLike | undefined;
          expect(col).toBeDefined();
          expect(toLogicalType(col!)).toBe(expectedType);
        }
      });

      test("pg and sqlite columns are consistent with each other", () => {
        const pgCols = getPgCols(tableName);
        const sqliteCols = getSqliteCols(tableName);

        const pgColNames = Object.keys(pgCols).sort();
        const sqliteColNames = Object.keys(sqliteCols).sort();
        expect(pgColNames).toEqual(sqliteColNames);

        for (const colName of pgColNames) {
          const pgType = toLogicalType(pgCols[colName] as DrizzleColumnLike);
          const sqliteType = toLogicalType(
            sqliteCols[colName] as DrizzleColumnLike
          );
          expect(pgType).toBe(sqliteType);
        }
      });

      test("pk columns are NOT NULL in both dialects", () => {
        const pgCols = getPgCols(tableName);
        const sqliteCols = getSqliteCols(tableName);

        for (const pkCol of descriptor.pk) {
          const pgCol = pgCols[pkCol] as DrizzleColumnLike | undefined;
          const sqliteCol = sqliteCols[pkCol] as DrizzleColumnLike | undefined;
          expect(pgCol).toBeDefined();
          expect(sqliteCol).toBeDefined();
          // PK columns must be NOT NULL in both dialects — a nullable PK is a schema bug
          expect(pgCol!.notNull).toBe(true);
          expect(sqliteCol!.notNull).toBe(true);
        }
      });

      // FIX 1 — composite primaryKey() constraint must actually be declared
      // (notNull alone does not prove the constraint exists; a removed primaryKey()
      // call would keep the suite green while allowing duplicate term_relationships).
      if (descriptor.pk.length > 1) {
        test("composite pk: primaryKey() constraint declared in both dialects", () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pgPks = pgGetTableConfig(pgSchema[tableName] as any).primaryKeys;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sqlitePks = sqliteGetTableConfig(sqliteSchema[tableName] as any).primaryKeys;

          // Exactly one composite PK entry
          expect(pgPks).toHaveLength(1);
          expect(sqlitePks).toHaveLength(1);

          // PK column list matches the descriptor (sorted for stable comparison)
          const pgPkCols = pgPks[0].columns
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((c: any) => c.name)
            .sort() as string[];
          const sqlitePkCols = sqlitePks[0].columns
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((c: any) => c.name)
            .sort() as string[];

          expect(pgPkCols).toEqual([...descriptor.pk].sort());
          expect(sqlitePkCols).toEqual([...descriptor.pk].sort());
        });
      }

      // FIX 3 — index shape conformance: name, column order, uniqueness, and direction
      // (pg only for direction; sqlite-core v0.45 has no .desc() API on index columns)
      test("pg: indexes match descriptor (name, columns, uniqueness, direction)", () => {
        // getTableConfig returns opaque pg-specific types — cast to any[] at the
        // boundary to avoid importing internal Drizzle pg index types.
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const cfg = pgGetTableConfig(pgSchema[tableName] as any);
        const actual = (cfg.indexes as any[])
          .map((idx: any) => ({
            name: idx.config.name as string,
            unique: idx.config.unique as boolean,
            columns: (idx.config.columns as any[]).map((c: any) => ({
              name: c.name as string,
              // indexConfig.order is "asc"|"desc"; default to "asc" if absent
              order: (c.indexConfig?.order ?? "asc") as "asc" | "desc",
            })),
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        /* eslint-enable @typescript-eslint/no-explicit-any */

        const expected = descriptor.indexes
          .map((idx) => ({
            name: idx.name,
            unique: idx.unique,
            columns: idx.columns.map((c) => ({ name: c.name, order: c.order })),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        expect(actual).toEqual(expected);
      });

      test("sqlite: indexes match descriptor (name, columns, uniqueness — direction not asserted)", () => {
        // getTableConfig returns opaque sqlite-specific types — cast to any[] at
        // the boundary to avoid importing internal Drizzle sqlite index types.
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const cfg = sqliteGetTableConfig(sqliteSchema[tableName] as any);
        const actual = (cfg.indexes as any[])
          .map((idx: any) => ({
            name: idx.config.name as string,
            unique: idx.config.unique as boolean,
            // sqlite columns are raw column objects — extract name only (no indexConfig)
            columns: (idx.config.columns as any[]).map((c: any) => c.name as string),
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        /* eslint-enable @typescript-eslint/no-explicit-any */

        const expected = descriptor.indexes
          .map((idx) => ({
            name: idx.name,
            unique: idx.unique,
            columns: idx.columns.map((c) => c.name),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        expect(actual).toEqual(expected);
      });
    });
  }
});
