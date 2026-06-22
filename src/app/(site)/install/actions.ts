"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CreateUserSchema } from "@/lib/auth/validation";
import { getUserRepository } from "@/lib/auth/factory";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { DuplicateEmailError } from "@/lib/auth/types";
import { getSiteConfigWriter, type SettingsFields } from "@/lib/content/site-config-writer";
import { getSetupState } from "@/lib/install/probes";

/** Discriminated union for useActionState in CreateSiteForm. */
export interface CreateSiteState {
  errors?: {
    title?: string;
    email?: string;
    password?: string;
  };
  formError?: string;
}

/**
 * Server action: validates, re-checks setup state (security lock), writes site
 * config, creates the first admin user, establishes a session, then redirects.
 *
 * Security invariant: re-checks getSetupState() === "needs-admin" AFTER
 * validation and BEFORE any write — a stale/replayed form can NEVER create
 * a second admin once setup is complete.
 *
 * redirect() is kept OUTSIDE the try/catch because it throws NEXT_REDIRECT —
 * a control-flow signal that MUST NOT be swallowed.
 */
export async function createSiteAction(
  _prev: CreateSiteState | undefined,
  formData: FormData
): Promise<CreateSiteState> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  // 1. Validate — NO writes on invalid input.
  const errors: NonNullable<CreateSiteState["errors"]> = {};

  if (!title) {
    errors.title = "Site title is required.";
  }

  const creds = CreateUserSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!creds.success) {
    for (const issue of creds.error.issues) {
      const field = issue.path[0];
      if (field === "email" && !errors.email) errors.email = issue.message;
      if (field === "password" && !errors.password) errors.password = issue.message;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // 2. SECURITY re-check: authoritative server-side guard against a second admin.
  // Must run AFTER validation (no DB round-trip on invalid input) and BEFORE any write.
  const setupState = await getSetupState();
  if (setupState === "complete") {
    // Setup is already done — redirect to login (no error message, correct UX).
    redirect("/admin/login");
  }
  if (setupState !== "needs-admin") {
    return {
      formError:
        "Setup prerequisites are not met. Please re-check the previous step.",
    };
  }

  // 3. AUTH_SECRET guard — createSession() would throw if missing.
  if (!process.env.AUTH_SECRET) {
    return {
      formError:
        "AUTH_SECRET is not set. Add it to .env.local and restart the server.",
    };
  }

  // 4. Write site config (idempotent overwrite — safe to re-run on re-submit).
  const fields: SettingsFields = {
    title,
    description,
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
    language: "en",
    author: { name: title },
    reading: { homepage: "hero-recent", posts_per_page: 10 },
    comments: { enabled: true, moderation: "manual" },
  };

  const written = await getSiteConfigWriter().writeConfig(fields);
  if (!written.ok) {
    return { formError: `Could not write site config: ${written.error}` };
  }

  // 5–6. Hash password and create admin user.
  // creds.data is defined here (safeParse succeeded; no early return above).
  const passwordHash = await hashPassword(creds.data!.password);

  try {
    const user = await getUserRepository().create({
      email: creds.data!.email,
      passwordHash,
      role: "admin",
    });

    // 7. Establish session so the operator lands logged-in at /admin.
    await createSession(user.id, user.role);
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return {
        errors: {
          email: "An account with this email already exists.",
        },
      };
    }
    throw err;
  }

  // 8. Redirect OUTSIDE try/catch — redirect() throws NEXT_REDIRECT which must
  // propagate freely and not be caught as an error.
  redirect("/admin");
}

/**
 * Re-check action: re-runs setup probes by revalidating and redirecting to /install.
 * Used by DatabaseStep, SchemaStep, and AuthSecretStep.
 */
export async function recheckAction(): Promise<void> {
  revalidatePath("/install");
  redirect("/install");
}
