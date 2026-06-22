// Public API surface for the auth bounded context (pure layer only).
// session.ts and dal.ts are server-only — import them directly where needed.

export { getUserRepository } from "./factory";
export { DrizzleUserAdapter } from "./drizzle-adapter";
export type { UserRepository } from "./ports";
export type { User, UserInput, PublicUser, Role, SessionPayload, AuthSession } from "./types";
export { DuplicateEmailError, InvalidCredentialsError } from "./types";
export { hashPassword, verifyPassword } from "./password";
export { signToken, verifyToken } from "./session-token";
export {
  CreateUserSchema,
  ChangePasswordSchema,
  PASSWORD_MIN,
} from "./validation";
export type { CreateUserInput, ChangePasswordInput } from "./validation";
