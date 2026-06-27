"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, deleteSession } from "@/lib/auth/session";
import { getUserRepository } from "@/lib/auth/factory";
import { verifyPassword } from "@/lib/auth/password";

export interface LoginState {
  error?: string;
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const GENERIC_ERROR = "invalidCredentials";

/**
 * Server Action: validate credentials, create session, redirect to /admin.
 * Returns a generic error message for both unknown email and wrong password
 * (no user enumeration — spec Domain 4).
 *
 * Intentionally does NOT call verifySession(): this action runs pre-auth (no
 * session exists yet). The two-layer guard (spec Domain 5) applies to actions
 * that perform privileged mutations; login is the entry point that creates the
 * session in the first place.
 */
export async function login(
  prevState: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: GENERIC_ERROR };
  }

  const { email, password } = parsed.data;

  let user;
  try {
    user = await getUserRepository().findByEmail(email);
  } catch {
    return {
      error: "notSetUp",
    };
  }

  if (!user) {
    return { error: GENERIC_ERROR };
  }

  const passwordMatch = await verifyPassword(password, user.passwordHash);
  if (!passwordMatch) {
    return { error: GENERIC_ERROR };
  }

  await createSession(user.id, user.role);
  // redirect() throws NEXT_REDIRECT — must remain outside any try/catch.
  redirect("/admin");
}

/**
 * Server Action: clear session cookie and redirect to login.
 *
 * Intentionally does NOT call verifySession(): logout performs no privileged
 * mutation. Calling it without a valid session simply clears a non-existent
 * cookie and redirects to the login page, which is harmless. The two-layer
 * guard (spec Domain 5) is reserved for actions that read or mutate protected
 * data (moderation actions, admin pages).
 */
export async function logout(): Promise<never> {
  await deleteSession();
  redirect("/admin/login");
}
