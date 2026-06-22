// UserRepository port — the single interface the app layer depends on.
// ZERO imports from React, Next.js, pg, or @electric-sql/pglite.

import type { User, UserInput, PublicUser, Role } from "./types";

export interface UserRepository {
  /** Returns the user with the given email (lowercased), or null if not found. */
  findByEmail(email: string): Promise<User | null>;

  /** Returns the user with the given id, or null if not found. */
  findById(id: string): Promise<User | null>;

  /** Creates a new user record. Throws DuplicateEmailError on unique violation. */
  create(input: UserInput): Promise<User>;

  /** Returns all users (passwordHash projected away), ordered by createdAt ASC. */
  listUsers(): Promise<PublicUser[]>;

  /** Hard-deletes the user row. Returns true if deleted, false if not found. */
  deleteUser(id: string): Promise<boolean>;

  /**
   * Sets the password_hash for a user.
   * Caller MUST pass a bcrypt hash — never plaintext.
   * Returns true if found and updated, false if not found.
   */
  updatePassword(id: string, newHash: string): Promise<boolean>;

  /** Count of users with role 'admin'. Used by the last-admin guard. */
  countAdmins(): Promise<number>;

  /**
   * Sets the role for a user. Returns the updated User, or null if not found.
   * Caller MUST enforce the last-admin invariant before calling.
   */
  updateRole(id: string, newRole: Role): Promise<User | null>;

  /**
   * Sets name and/or bio for a user. Only provided fields are updated.
   * Empty strings are coerced to null. Returns the updated User, or null if not found.
   */
  updateProfile(id: string, fields: { name?: string | null; bio?: string | null }): Promise<User | null>;

  /**
   * Finds a user by display name (case-insensitive). Returns a PublicUser (no passwordHash),
   * or null if no match is found.
   */
  findPublicByName(name: string): Promise<PublicUser | null>;
}
