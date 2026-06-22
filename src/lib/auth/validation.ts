import { z } from "zod";

/**
 * Passwords are required (non-empty); no length minimum, matching WordPress.
 * WordPress shows a strength meter and "confirm weak password" checkbox but
 * never blocks by length — it only disallows empty passwords.
 */
export const PASSWORD_MIN = 1;

/**
 * Zod schema for creating a new admin user.
 * - Email is trimmed and lowercased at the validation boundary (case-insensitive storage).
 * - Password must be non-empty (no length minimum, matching WordPress behavior).
 */
export const CreateUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required.")
    .email("A valid email address is required.")
    .max(254, "Email must be 254 characters or fewer."),
  password: z.string().min(1, "Password is required."),
  role: z.enum(["admin", "editor", "author"]).default("admin"),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

/**
 * Zod schema for changing a user's password.
 * No current-password challenge required (admin-initiated action).
 */
export const ChangePasswordSchema = z.object({
  password: z.string().min(1, "Password is required."),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

/**
 * Zod schema for changing an existing user's role.
 * Admin-initiated; the enum mirrors the Role union exactly.
 */
export const ChangeUserRoleSchema = z.object({
  role: z.enum(["admin", "editor", "author"]),
});

export type ChangeUserRoleInput = z.infer<typeof ChangeUserRoleSchema>;
