import { describe, expect, test } from "bun:test";
import {
  CreateUserSchema,
  ChangePasswordSchema,
  ChangeUserRoleSchema,
} from "../../../src/lib/auth/validation";

describe("CreateUserSchema", () => {
  test("valid input passes", () => {
    const result = CreateUserSchema.safeParse({
      email: "admin@example.com",
      password: "supersecurepassword",
    });
    expect(result.success).toBe(true);
  });

  test("email is lowercased and trimmed", () => {
    const result = CreateUserSchema.safeParse({
      email: "  ADMIN@EXAMPLE.COM  ",
      password: "supersecurepassword",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("admin@example.com");
    }
  });

  test("invalid email format → validation error on email field", () => {
    const result = CreateUserSchema.safeParse({
      email: "notanemail",
      password: "supersecurepassword",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailIssue = result.error.issues.find((i) =>
        i.path.includes("email")
      );
      expect(emailIssue).toBeDefined();
    }
  });

  test("empty password → rejected with 'Password is required.'", () => {
    const result = CreateUserSchema.safeParse({
      email: "admin@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pwIssue = result.error.issues.find((i) =>
        i.path.includes("password")
      );
      expect(pwIssue).toBeDefined();
      expect(pwIssue?.message).toBe("Password is required.");
    }
  });

  test("single-character password → passes (no length minimum)", () => {
    const result = CreateUserSchema.safeParse({
      email: "admin@example.com",
      password: "a",
    });
    expect(result.success).toBe(true);
  });

  test("missing email → validation error", () => {
    const result = CreateUserSchema.safeParse({
      email: "",
      password: "supersecurepassword",
    });
    expect(result.success).toBe(false);
  });
});

describe("ChangePasswordSchema", () => {
  test("empty password → rejected with 'Password is required.'", () => {
    const result = ChangePasswordSchema.safeParse({ password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pwIssue = result.error.issues.find((i) =>
        i.path.includes("password")
      );
      expect(pwIssue).toBeDefined();
      expect(pwIssue?.message).toBe("Password is required.");
    }
  });

  test("single-character password → passes (no length minimum)", () => {
    const result = ChangePasswordSchema.safeParse({ password: "x" });
    expect(result.success).toBe(true);
  });

  test("long password → passes", () => {
    const result = ChangePasswordSchema.safeParse({
      password: "averylongandvalidpassword",
    });
    expect(result.success).toBe(true);
  });
});

describe("ChangeUserRoleSchema", () => {
  test('valid role "editor" passes', () => {
    const result = ChangeUserRoleSchema.safeParse({ role: "editor" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("editor");
    }
  });

  test('valid role "admin" passes', () => {
    const result = ChangeUserRoleSchema.safeParse({ role: "admin" });
    expect(result.success).toBe(true);
  });

  test('valid role "author" passes', () => {
    const result = ChangeUserRoleSchema.safeParse({ role: "author" });
    expect(result.success).toBe(true);
  });

  test('invalid role "superadmin" → validation error', () => {
    const result = ChangeUserRoleSchema.safeParse({ role: "superadmin" });
    expect(result.success).toBe(false);
  });

  test('invalid role "x" → validation error', () => {
    const result = ChangeUserRoleSchema.safeParse({ role: "x" });
    expect(result.success).toBe(false);
  });

  test("missing role field → validation error", () => {
    const result = ChangeUserRoleSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
