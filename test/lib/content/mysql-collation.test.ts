/**
 * Pure unit tests for the MySQL/MariaDB collation helpers (no live DB).
 *
 * Covers:
 *   - databaseNameFromUrl: happy path, malformed URL, missing db segment,
 *     URL-encoded db segment, and credential redaction in error messages.
 *   - mysqlDatabaseCollationStatement: backtick escaping (doubling).
 *
 * The credential-redaction cases are the security contract: a DATABASE_URL of the
 * form mysql://user:password@host/db must NEVER leak its password into a thrown
 * Error message (those messages get logged verbatim by scripts/apply-mysql-collation.ts).
 */
import { describe, test, expect } from "bun:test";
import {
  databaseNameFromUrl,
  mysqlDatabaseCollationStatement,
  CONTENT_CHARSET,
  CONTENT_COLLATION,
} from "@/lib/content/mysql-collation";

describe("databaseNameFromUrl", () => {
  test("happy path: reads the database name from the URL path", () => {
    expect(databaseNameFromUrl("mysql://root:pw@127.0.0.1:3307/tintero")).toBe(
      "tintero"
    );
  });

  test("decodes a URL-encoded database segment", () => {
    expect(databaseNameFromUrl("mysql://root:pw@127.0.0.1:3306/my%20db")).toBe(
      "my db"
    );
  });

  test("throws on a malformed URL", () => {
    expect(() => databaseNameFromUrl("not a url")).toThrow(
      /not a valid URL/i
    );
  });

  test("throws when the URL has no database name in its path", () => {
    expect(() => databaseNameFromUrl("mysql://root:pw@127.0.0.1:3306")).toThrow(
      /no database name/i
    );
  });

  test("does NOT leak the password when a malformed URL throws", () => {
    const secret = "SuperSecret123";
    let message = "";
    try {
      databaseNameFromUrl(`mysql://admin:${secret}@host:badport/db`);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(secret);
  });

  test("does NOT leak the password when the db segment is missing", () => {
    const secret = "SuperSecret123";
    let message = "";
    try {
      databaseNameFromUrl(`mysql://admin:${secret}@127.0.0.1:3306`);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(secret);
  });
});

describe("mysqlDatabaseCollationStatement", () => {
  test("wraps the db name in backticks with the pinned charset + collation", () => {
    expect(mysqlDatabaseCollationStatement("tintero")).toBe(
      `ALTER DATABASE \`tintero\` CHARACTER SET ${CONTENT_CHARSET} COLLATE ${CONTENT_COLLATION}`
    );
  });

  test("escapes a backtick in the db name by doubling it", () => {
    // A db name containing a backtick must be quoted as `foo``bar` (doubled).
    const stmt = mysqlDatabaseCollationStatement("foo`bar");
    expect(stmt).toContain("`foo``bar`");
    expect(stmt).toBe(
      `ALTER DATABASE \`foo\`\`bar\` CHARACTER SET ${CONTENT_CHARSET} COLLATE ${CONTENT_COLLATION}`
    );
  });
});
