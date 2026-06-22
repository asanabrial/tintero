"use client";

import { useActionState } from "react";
import { login } from "./actions";
import type { LoginState } from "./actions";
import { Field, FormAlert, TextInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

/**
 * LoginForm — client island for the admin login page.
 * Presentational only: owns form UX (pending state, error display).
 * No data fetching, no auth logic — all auth is handled by the login server action.
 */
export function LoginForm() {
  const tr = useT();
  const [state, dispatch] = useActionState<LoginState | undefined, FormData>(
    login,
    undefined
  );

  return (
    <form action={dispatch} className="space-y-4">
      <Field htmlFor="email" label={tr("admin.login.email")}>
        <TextInput
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          required
        />
      </Field>
      <Field htmlFor="password" label={tr("admin.login.password")}>
        <TextInput
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </Field>
      {state?.error && <FormAlert>{state.error}</FormAlert>}
      <SubmitButton label={tr("admin.login.signIn")} pendingLabel={tr("admin.login.signingIn")} fullWidth />
    </form>
  );
}
