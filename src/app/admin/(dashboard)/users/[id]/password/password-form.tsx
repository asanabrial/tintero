"use client";

import { useActionState } from "react";
import type { UserActionState } from "../../actions";
import { useT } from "@/lib/i18n/provider";
import { Field, FormAlert, TextInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";

interface PasswordFormProps {
  /** Bound server action — updatePasswordAction pre-bound with the target user id. */
  action: (prevState: UserActionState, formData: FormData) => Promise<UserActionState>;
  /** Target user's email — displayed as context for the admin. */
  email: string;
}

/**
 * PasswordForm — client island for the change-password form.
 * Presentational only: owns form UX (pending state, field/global errors).
 * No data fetching, no auth, no DB imports.
 * Variant is driven by the bound `action` prop (composition pattern — no boolean flags).
 */
export function PasswordForm({ action, email }: PasswordFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<UserActionState, FormData>(
    action,
    undefined
  );

  const globalError =
    state && !state.ok && (!state.field || state.field === "general")
      ? state.error
      : null;

  const passwordError =
    state && !state.ok && state.field === "password" ? state.error : null;

  return (
    <form action={dispatch} noValidate className="space-y-4">
      {/* Context: show which user's password is being changed */}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {tr("admin.users.changingPasswordFor", { email })}
      </p>

      {/* Guard-level error (e.g., user not found) */}
      {globalError && <FormAlert>{tr(globalError)}</FormAlert>}

      {/* New password */}
      <Field htmlFor="new-password" label={tr("admin.users.newPassword")} required layout="stacked" error={passwordError ? tr(passwordError) : null}>
        <TextInput
          id="new-password"
          type="password"
          name="password"
          minLength={12}
          required
          aria-describedby={passwordError ? "new-password-error" : undefined}
        />
      </Field>

      <SubmitButton label={tr("admin.users.changePassword")} pendingLabel={tr("admin.common.saving")} />
    </form>
  );
}
