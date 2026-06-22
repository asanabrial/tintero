import { beforeEach, describe, expect, test } from "bun:test";
import { DuplicateEmailError } from "../../../src/lib/auth/types";
import { verifyPassword } from "../../../src/lib/auth/password";
import type { TestContext } from "./helpers";
import { setupDb } from "./helpers";

// DrizzleUserAdapter does not exist yet — written RED first (strict TDD).
// Once src/lib/auth/drizzle-adapter.ts is created (WU-4), all tests must turn GREEN.

let ctx: TestContext;

beforeEach(async () => {
  // Fresh in-memory DB for every test
  ctx = await setupDb();
});

describe("DrizzleUserAdapter — create", () => {
  test("create returns a User with UUID id and createdAt", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    expect(user.id).toBeString();
    expect(user.id.length).toBeGreaterThan(0);
    expect(user.email).toBe("alice@example.com");
    expect(user.role).toBe("admin");
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  test("stored passwordHash starts with $2 (bcrypt — never plaintext)", async () => {
    const hash = "$2b$10$examplehashvalue";
    const user = await ctx.adapter.create({
      email: "bob@example.com",
      passwordHash: hash,
      role: "admin",
    });
    expect(user.passwordHash).toStartWith("$2");
    expect(user.passwordHash).toBe(hash);
  });

  test("create twice with same email (normalized) throws DuplicateEmailError", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash1",
      role: "admin",
    });
    await expect(
      ctx.adapter.create({
        email: "alice@example.com",
        passwordHash: "$2b$10$hash2",
        role: "admin",
      })
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });
});

describe("DrizzleUserAdapter — findByEmail", () => {
  test("findByEmail returns the user after creation", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
    });
    const found = await ctx.adapter.findByEmail("alice@example.com");
    expect(found).not.toBeNull();
    expect(found!.email).toBe("alice@example.com");
  });

  test("findByEmail is case-insensitive (email normalized to lowercase)", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
    });
    const found = await ctx.adapter.findByEmail("Alice@EXAMPLE.COM");
    expect(found).not.toBeNull();
    expect(found!.email).toBe("alice@example.com");
  });

  test("findByEmail returns null when user does not exist", async () => {
    const found = await ctx.adapter.findByEmail("ghost@example.com");
    expect(found).toBeNull();
  });
});

describe("DrizzleUserAdapter — findById", () => {
  test("findById returns the user after creation", async () => {
    const created = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
    });
    const found = await ctx.adapter.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.email).toBe("alice@example.com");
  });

  test("findById returns null for non-existent id", async () => {
    const found = await ctx.adapter.findById("00000000-0000-0000-0000-000000000000");
    expect(found).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// listUsers — RED tests (WU-2)
// ─────────────────────────────────────────────────────────────

describe("DrizzleUserAdapter — listUsers", () => {
  test("empty DB returns []", async () => {
    const users = await ctx.adapter.listUsers();
    expect(users).toEqual([]);
  });

  test("returned users have no passwordHash property", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    const users = await ctx.adapter.listUsers();
    expect(users.length).toBe(1);
    expect(users[0]).not.toHaveProperty("passwordHash");
  });

  test("users are ordered by createdAt ASC", async () => {
    // Insert three users in sequence; PGlite default timestamps advance monotonically.
    // We wait briefly between inserts to ensure distinct timestamps.
    await ctx.adapter.create({
      email: "first@example.com",
      passwordHash: "$2b$10$hash1",
      role: "admin",
    });
    await new Promise((r) => setTimeout(r, 10));
    await ctx.adapter.create({
      email: "second@example.com",
      passwordHash: "$2b$10$hash2",
      role: "admin",
    });
    await new Promise((r) => setTimeout(r, 10));
    await ctx.adapter.create({
      email: "third@example.com",
      passwordHash: "$2b$10$hash3",
      role: "admin",
    });

    const users = await ctx.adapter.listUsers();
    expect(users.length).toBe(3);
    expect(users[0].email).toBe("first@example.com");
    expect(users[1].email).toBe("second@example.com");
    expect(users[2].email).toBe("third@example.com");
  });

  test("returned user has id, email, role, createdAt fields", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    const users = await ctx.adapter.listUsers();
    const user = users[0];
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("role");
    expect(user).toHaveProperty("createdAt");
  });
});

// ─────────────────────────────────────────────────────────────
// deleteUser — RED tests (WU-2)
// ─────────────────────────────────────────────────────────────

describe("DrizzleUserAdapter — deleteUser", () => {
  test("existing id returns true", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    const result = await ctx.adapter.deleteUser(user.id);
    expect(result).toBe(true);
  });

  test("deleted user no longer findable by id", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    await ctx.adapter.deleteUser(user.id);
    const found = await ctx.adapter.findById(user.id);
    expect(found).toBeNull();
  });

  test("non-existent id returns false", async () => {
    const result = await ctx.adapter.deleteUser(
      "00000000-0000-0000-0000-000000000000"
    );
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// updatePassword — RED tests (WU-2)
// ─────────────────────────────────────────────────────────────

describe("DrizzleUserAdapter — updatePassword", () => {
  test("existing id returns true", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$oldhash",
      role: "admin",
    });
    const result = await ctx.adapter.updatePassword(user.id, "$2b$10$newhash");
    expect(result).toBe(true);
  });

  test("updated password hash is persisted (round-trip via verifyPassword)", async () => {
    // Use a real bcrypt hash for the round-trip test
    const plaintext = "correcthorsebatterystaple";
    const { hashPassword } = await import("../../../src/lib/auth/password");
    const newHash = await hashPassword(plaintext);

    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$oldhash",
      role: "admin",
    });
    await ctx.adapter.updatePassword(user.id, newHash);

    // Fetch the row and verify the new hash works
    const found = await ctx.adapter.findByEmail("alice@example.com");
    expect(found).not.toBeNull();
    const matches = await verifyPassword(plaintext, found!.passwordHash);
    expect(matches).toBe(true);
  });

  test("non-existent id returns false", async () => {
    const result = await ctx.adapter.updatePassword(
      "00000000-0000-0000-0000-000000000000",
      "$2b$10$newhash"
    );
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// countAdmins — RED tests (WU-2)
// ─────────────────────────────────────────────────────────────

describe("DrizzleUserAdapter — countAdmins", () => {
  test("empty table returns 0", async () => {
    const count = await ctx.adapter.countAdmins();
    expect(count).toBe(0);
  });

  test("returns accurate count of admin users", async () => {
    await ctx.adapter.create({
      email: "admin1@example.com",
      passwordHash: "$2b$10$hash1",
      role: "admin",
    });
    await ctx.adapter.create({
      email: "admin2@example.com",
      passwordHash: "$2b$10$hash2",
      role: "admin",
    });
    await ctx.adapter.create({
      email: "admin3@example.com",
      passwordHash: "$2b$10$hash3",
      role: "admin",
    });
    const count = await ctx.adapter.countAdmins();
    expect(count).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// updateRole — RED tests (rbac-completion)
// ─────────────────────────────────────────────────────────────

describe("DrizzleUserAdapter — updateRole", () => {
  test("existing id returns updated User with new role", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    const updated = await ctx.adapter.updateRole(user.id, "editor");
    expect(updated).not.toBeNull();
    expect(updated!.role).toBe("editor");
    expect(updated!.id).toBe(user.id);
  });

  test("role change is persisted (round-trip via findById)", async () => {
    const user = await ctx.adapter.create({
      email: "bob@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    await ctx.adapter.updateRole(user.id, "author");
    const found = await ctx.adapter.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.role).toBe("author");
  });

  test("other fields are unchanged after updateRole", async () => {
    const user = await ctx.adapter.create({
      email: "carol@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
    });
    const updated = await ctx.adapter.updateRole(user.id, "editor");
    expect(updated).not.toBeNull();
    expect(updated!.email).toBe(user.email);
    expect(updated!.passwordHash).toBe(user.passwordHash);
    expect(updated!.createdAt).toEqual(user.createdAt);
  });

  test("unknown id returns null", async () => {
    const result = await ctx.adapter.updateRole(
      "00000000-0000-0000-0000-000000000000",
      "editor"
    );
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// name/bio on create and find
// ─────────────────────────────────────────────────────────────

describe("DrizzleUserAdapter — name/bio on create and find", () => {
  test("create persists name when provided", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
      name: "Alice Smith",
    });
    expect(user.name).toBe("Alice Smith");
  });

  test("create persists null when name is empty string", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
      name: "",
    });
    expect(user.name).toBeNull();
  });

  test("create stores null when name not provided", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
    });
    expect(user.name).toBeNull();
  });

  test("findById returns name and bio", async () => {
    const created = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
      name: "Alice",
      bio: "Writer",
    });
    const found = await ctx.adapter.findById(created.id);
    expect(found?.name).toBe("Alice");
    expect(found?.bio).toBe("Writer");
  });

  test("findByEmail returns name and bio", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
      name: "Alice",
      bio: "Writer",
    });
    const found = await ctx.adapter.findByEmail("alice@example.com");
    expect(found?.name).toBe("Alice");
    expect(found?.bio).toBe("Writer");
  });

  test("listUsers returns name and bio", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
      name: "Alice",
      bio: "Writer",
    });
    const users = await ctx.adapter.listUsers();
    expect(users[0].name).toBe("Alice");
    expect(users[0].bio).toBe("Writer");
  });
});

// ─────────────────────────────────────────────────────────────
// updateProfile
// ─────────────────────────────────────────────────────────────

describe("DrizzleUserAdapter — updateProfile", () => {
  test("sets name and bio", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
    });
    const updated = await ctx.adapter.updateProfile(user.id, { name: "Alice", bio: "Hi" });
    expect(updated?.name).toBe("Alice");
    expect(updated?.bio).toBe("Hi");
  });

  test("empty string becomes null", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
      name: "Alice",
    });
    const updated = await ctx.adapter.updateProfile(user.id, { name: "" });
    expect(updated?.name).toBeNull();
  });

  test("partial update only changes name", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
      bio: "Original bio",
    });
    const updated = await ctx.adapter.updateProfile(user.id, { name: "Alice" });
    expect(updated?.name).toBe("Alice");
    expect(updated?.bio).toBe("Original bio");
  });

  test("returns null for unknown id", async () => {
    const result = await ctx.adapter.updateProfile("00000000-0000-0000-0000-000000000000", { name: "X" });
    expect(result).toBeNull();
  });

  test("round-trip via findById", async () => {
    const user = await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
    });
    await ctx.adapter.updateProfile(user.id, { name: "Alice", bio: "Writer" });
    const found = await ctx.adapter.findById(user.id);
    expect(found?.name).toBe("Alice");
    expect(found?.bio).toBe("Writer");
  });
});

// ─────────────────────────────────────────────────────────────
// findPublicByName
// ─────────────────────────────────────────────────────────────

describe("DrizzleUserAdapter — findPublicByName", () => {
  test("finds by exact name", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
      name: "Alice Smith",
    });
    const found = await ctx.adapter.findPublicByName("Alice Smith");
    expect(found).not.toBeNull();
    expect(found!.email).toBe("alice@example.com");
    expect(found).not.toHaveProperty("passwordHash");
  });

  test("case-insensitive match", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$hash",
      role: "admin",
      name: "Alice Smith",
    });
    const found = await ctx.adapter.findPublicByName("alice smith");
    expect(found).not.toBeNull();
    expect(found!.email).toBe("alice@example.com");
  });

  test("returns null when not found", async () => {
    const found = await ctx.adapter.findPublicByName("Ghost");
    expect(found).toBeNull();
  });

  test("returns first match when multiple users share a name", async () => {
    await ctx.adapter.create({
      email: "alice1@example.com",
      passwordHash: "$2b$10$hash1",
      role: "admin",
      name: "Alice",
    });
    await new Promise((r) => setTimeout(r, 10));
    await ctx.adapter.create({
      email: "alice2@example.com",
      passwordHash: "$2b$10$hash2",
      role: "admin",
      name: "Alice",
    });
    const found = await ctx.adapter.findPublicByName("Alice");
    expect(found).not.toBeNull();
    // Should return one result (not throw)
    expect(["alice1@example.com", "alice2@example.com"]).toContain(found!.email);
  });
});

describe("DrizzleUserAdapter — listUsers does not return passwordHash after name/bio projection added", () => {
  test("listUsers result has no passwordHash after name/bio projection added", async () => {
    await ctx.adapter.create({
      email: "alice@example.com",
      passwordHash: "$2b$10$fakehash",
      role: "admin",
      name: "Alice",
    });
    const users = await ctx.adapter.listUsers();
    expect(users[0]).not.toHaveProperty("passwordHash");
  });
});
