// Domain types for the auth bounded context.
// No imports from Next.js, React, pg, or pglite — stays ORM-agnostic.

export type Role = "admin" | "editor" | "author";

/** Exhaustive set of valid role values. Used by isKnownRole() whitelist guard. */
export const KNOWN_ROLES = ["admin", "editor", "author"] as const;

/**
 * Type guard: returns true if `r` is a known Role value.
 * Used by verifySession() as a WHITELIST check — fails closed on unknown/null roles.
 */
export function isKnownRole(r: string): r is Role {
  return (KNOWN_ROLES as readonly string[]).includes(r);
}

/** Full user row as returned from the repository. */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  name: string | null;
  bio: string | null;
}

/**
 * Public-facing user projection — passwordHash is NEVER included.
 * Used by listUsers() and all admin UI surfaces.
 * Mirror of PublicComment (excludes sensitive fields at the SQL projection level).
 */
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  name: string | null;
  bio: string | null;
  /** Pre-computed Gravatar URL — computed server-side from email. */
  avatarUrl?: string | null;
}

/** Input for creating a new user. passwordHash must be pre-hashed — never plaintext. */
export interface UserInput {
  email: string;
  passwordHash: string;
  role: Role;
  name?: string;
  bio?: string;
}

/** Payload embedded in the session JWT. */
export interface SessionPayload {
  userId: string;
  role: Role;
  expiresAt: string;
}

/** Resolved session returned by verifySession(). */
export interface AuthSession {
  isAuth: boolean;
  userId: string;
  role: Role;
}

/** Thrown when creating a user with an email that already exists (pg unique violation). */
export class DuplicateEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateEmailError";
  }
}

/** Thrown when credentials do not match any user (used internally — callers surface generic error). */
export class InvalidCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}
