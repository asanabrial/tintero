// GET /api/v1/users  — list users (auth required)
// POST /api/v1/users — create user (auth required)
//
// NO 'export const dynamic' — connection() at request time makes this dynamic automatically.
// getUserRepository() MUST be called inside try — it throws synchronously on missing DATABASE_URL.
//
// R1 path: pure-helpers (handleUsersGet, handleUsersPost) are exported for unit testing.
// The route exports GET/POST are thin connection() + helper wrappers.

import { connection } from "next/server";
import {
  getUserRepository,
  hashPassword,
  DuplicateEmailError,
  CreateUserSchema,
} from "@/lib/auth";
import { verifyApiAuth } from "@/lib/api/auth";
import { jsonOk, jsonError } from "@/lib/api/errors";
import { toUserJson, toUserListJson } from "@/lib/api/serialize";
import type { PublicUser } from "@/lib/auth/types";

/**
 * Core GET logic — no connection() call, testable directly.
 */
export async function handleUsersGet(req: Request): Promise<Response> {
  if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");
  try {
    const repo = getUserRepository();
    const users = await repo.listUsers();
    return jsonOk(toUserListJson(users, { total: users.length, page: 1, pageSize: users.length }));
  } catch {
    return jsonError(503, "Database unavailable");
  }
}

/**
 * Core POST logic — no connection() call, testable directly.
 */
export async function handleUsersPost(req: Request): Promise<Response> {
  if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid request", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const repo = getUserRepository();
    const created = await repo.create({
      email: parsed.data.email,
      passwordHash,
      role: "admin",
    });
    // SECURITY: project inline — NEVER pass the full User (which has passwordHash) to toUserJson
    const publicUser: PublicUser = {
      id: created.id,
      email: created.email,
      role: created.role,
      createdAt: created.createdAt,
      name: created.name,
      bio: created.bio,
    };
    return jsonOk(toUserJson(publicUser), 201);
  } catch (e) {
    if (e instanceof DuplicateEmailError) {
      return jsonError(409, "An account with that email already exists");
    }
    return jsonError(503, "Database unavailable");
  }
}

export async function GET(req: Request): Promise<Response> {
  await connection();
  return handleUsersGet(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleUsersPost(req);
}
