#!/usr/bin/env bun
/**
 * CLI bootstrap tool for creating admin users in tintero.
 *
 * Usage (from repo root):
 *   bun run user:create <email> <password>
 *
 * Requires DATABASE_URL to be set.
 * Imports from src/lib/auth using relative paths (no @/ alias — not available outside Next.js).
 *
 * Security: the password is NEVER echoed to stdout or stderr at any point.
 * Satisfies: Domain 7 (all scenarios).
 */

import { hashPassword } from "../src/lib/auth/password";
import { getUserRepository } from "../src/lib/auth/factory";
import { DuplicateEmailError } from "../src/lib/auth/types";
import { CreateUserSchema } from "../src/lib/auth/validation";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function printError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

// ────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , email, password] = process.argv;

  if (!email || !password || email === "--help" || email === "-h") {
    process.stdout.write(
      "Usage:\n  bun run user:create <email> <password>\n" +
        "\nCreates an admin user in the database.\n" +
        "Requires DATABASE_URL to be set.\n"
    );
    process.exit(0);
  }

  // Validate email and password via shared Zod schema (normalizes email to lowercase).
  // Using CreateUserSchema unifies CLI and web validation in one place.
  const parsed = CreateUserSchema.safeParse({ email, password });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field = firstIssue?.path[0];
    if (field === "email") {
      printError("Invalid email format.");
    } else if (field === "password") {
      printError("Password is required.");
    } else {
      printError(firstIssue?.message ?? "Invalid input.");
    }
    process.exit(1);
  }

  // Hash password — NEVER store or log the plaintext
  const passwordHash = await hashPassword(parsed.data.password);

  try {
    await getUserRepository().create({
      // parsed.data.email is already lowercased by the schema's .toLowerCase() transform
      email: parsed.data.email,
      passwordHash,
      role: "admin",
    });
    process.stdout.write("User created successfully.\n");
    process.exit(0);
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      printError("Email already exists.");
      process.exit(1);
    }
    printError(String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
