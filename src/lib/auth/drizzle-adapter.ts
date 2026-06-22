// DrizzleUserAdapter — implements UserRepository using an injected drizzle instance.
// No imports from pg, @electric-sql/pglite, React, or Next.js.

import { eq, asc, count, ilike } from "drizzle-orm";
import { users } from "./schema";
import type { User, UserInput, PublicUser, Role } from "./types";
import { DuplicateEmailError } from "./types";
import type { UserRepository } from "./ports";

// Accept the widest drizzle instance shape without coupling to a specific driver
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any;

/** Returns true if the error (or its cause chain) is a pg unique violation (code 23505). */
function isUniqueViolation(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (e["code"] === "23505") return true;
    // DrizzleQueryError wraps the original error in a `cause` property
    if (e["cause"] !== undefined) return isUniqueViolation(e["cause"]);
  }
  return false;
}

/** Maps a DB row to a User domain object (includes passwordHash — for internal use only). */
function toUser(row: {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  name?: string | null;
  bio?: string | null;
}): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    role: row.role,
    createdAt: row.createdAt,
    name: row.name ?? null,
    bio: row.bio ?? null,
  };
}

/**
 * Maps a DB row to a PublicUser (passwordHash is DELIBERATELY absent).
 * Used by listUsers() — the hash never enters the Node.js read path.
 */
function toPublicUser(row: {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  name?: string | null;
  bio?: string | null;
}): PublicUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
    name: row.name ?? null,
    bio: row.bio ?? null,
  };
}

export class DrizzleUserAdapter implements UserRepository {
  constructor(private readonly db: DrizzleDb) {}

  async create(input: UserInput): Promise<User> {
    // Normalize email to lowercase before insert (spec: Email Normalization)
    const normalizedEmail = input.email.toLowerCase();
    try {
      const inserted = await this.db
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash: input.passwordHash,
          role: input.role,
          name: input.name?.trim() || null,
          bio: input.bio?.trim() || null,
        })
        .returning();
      return toUser(inserted[0]);
    } catch (err) {
      // Catch pg unique violation (error code 23505) and surface DuplicateEmailError.
      // The error may be wrapped by DrizzleQueryError — check both the error and its cause.
      if (isUniqueViolation(err)) {
        throw new DuplicateEmailError(
          `A user with email "${normalizedEmail}" already exists.`
        );
      }
      throw err;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    // Normalize email to lowercase for case-insensitive lookup
    const normalizedEmail = email.toLowerCase();
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail));
    return rows.length > 0 ? toUser(rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id));
    return rows.length > 0 ? toUser(rows[0]) : null;
  }

  /**
   * Returns all users ordered by createdAt ASC.
   * passwordHash is NEVER selected — explicit column projection ensures the hash
   * never enters the Node.js read path and cannot leak via RSC serialization.
   */
  async listUsers(): Promise<PublicUser[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        name: users.name,
        bio: users.bio,
        // passwordHash is intentionally absent from this projection
      })
      .from(users)
      .orderBy(asc(users.createdAt));
    return rows.map(toPublicUser);
  }

  /** Hard-deletes the user row. Returns true if deleted, false if not found. */
  async deleteUser(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });
    return rows.length > 0;
  }

  /**
   * Sets the stored password hash for a user.
   * Caller MUST pass a bcrypt hash — never plaintext.
   * Returns true if found and updated, false if the user does not exist.
   */
  async updatePassword(id: string, newHash: string): Promise<boolean> {
    const rows = await this.db
      .update(users)
      .set({ passwordHash: newHash })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    return rows.length > 0;
  }

  /**
   * Returns the count of users with role 'admin'.
   * Used by the last-admin guard in deleteUserFormAction.
   */
  async countAdmins(): Promise<number> {
    const result = await this.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    return Number(result[0]?.value ?? 0);
  }

  /**
   * Sets the role for a user.
   * Returns the updated User, or null if the user does not exist.
   */
  async updateRole(id: string, newRole: Role): Promise<User | null> {
    const rows = await this.db
      .update(users)
      .set({ role: newRole })
      .where(eq(users.id, id))
      .returning();
    return rows.length > 0 ? toUser(rows[0]) : null;
  }

  /**
   * Sets name and/or bio for a user. Only fields that are explicitly provided
   * (not undefined) are written; this allows partial updates without clobbering
   * fields the caller did not intend to touch.
   * Empty strings are coerced to null.
   * Returns the updated User, or null if not found.
   */
  async updateProfile(
    id: string,
    fields: { name?: string | null; bio?: string | null }
  ): Promise<User | null> {
    const setObj: Record<string, unknown> = {};
    if (fields.name !== undefined) setObj["name"] = fields.name?.trim() || null;
    if (fields.bio !== undefined) setObj["bio"] = fields.bio?.trim() || null;
    const rows = await this.db
      .update(users)
      .set(setObj)
      .where(eq(users.id, id))
      .returning();
    return rows.length > 0 ? toUser(rows[0]) : null;
  }

  /**
   * Finds a user by display name (case-insensitive ilike match).
   * Returns a PublicUser (passwordHash NEVER selected), or null if not found.
   */
  async findPublicByName(name: string): Promise<PublicUser | null> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        name: users.name,
        bio: users.bio,
      })
      .from(users)
      .where(ilike(users.name, name))
      .limit(1);
    return rows.length > 0 ? toPublicUser(rows[0]) : null;
  }
}
