import { describe, expect, test } from "bun:test";
import { contentSchemaPushCommand } from "../../../src/lib/install/content-schema-command";

describe("contentSchemaPushCommand — FS / unset store", () => {
  test("returns null when contentStore is undefined", () => {
    expect(contentSchemaPushCommand(undefined, undefined)).toBeNull();
  });

  test("returns null when contentStore is 'fs'", () => {
    expect(contentSchemaPushCommand("fs", undefined)).toBeNull();
  });

  test("returns null when contentStore is 'fs' even with a dialect set", () => {
    expect(contentSchemaPushCommand("fs", "postgresql")).toBeNull();
  });

  test("returns null when contentStore is empty string", () => {
    expect(contentSchemaPushCommand("", "postgresql")).toBeNull();
  });
});

describe("contentSchemaPushCommand — DB store + postgresql", () => {
  test("returns pg push command when contentStore is 'db' and dialect is 'postgresql'", () => {
    expect(contentSchemaPushCommand("db", "postgresql")).toBe(
      "bun run db:content:push:pg"
    );
  });
});

describe("contentSchemaPushCommand — DB store + sqlite", () => {
  test("returns sqlite push command when contentStore is 'db' and dialect is 'sqlite'", () => {
    expect(contentSchemaPushCommand("db", "sqlite")).toBe(
      "bun run db:content:push:sqlite"
    );
  });
});

describe("contentSchemaPushCommand — DB store + missing or unknown dialect", () => {
  test("returns null when contentStore is 'db' and dialect is undefined", () => {
    expect(contentSchemaPushCommand("db", undefined)).toBeNull();
  });

  test("returns null when contentStore is 'db' and dialect is an unrecognised value", () => {
    expect(contentSchemaPushCommand("db", "mysql")).toBeNull();
  });

  test("returns null when contentStore is 'db' and dialect is empty string", () => {
    expect(contentSchemaPushCommand("db", "")).toBeNull();
  });
});
