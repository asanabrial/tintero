"use client";

import { useActionState } from "react";
import type { ProfileActionState } from "./actions";
import { useT } from "@/lib/i18n/provider";
import { Field, FormAlert, TextInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";

interface ProfilePasswordFormProps {
  action: (prev: ProfileActionState, formData: FormData) => Promise<ProfileActionState>;
}

export function ProfilePasswordForm({ action }: ProfilePasswordFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<ProfileActionState, FormData>(action, undefined);

  const globalError = state && !state.ok && (!state.field || state.field === "general") ? state.error : null;
  const passwordError = state && !state.ok && state.field === "password" ? state.error : null;

  return (
    <form action={dispatch} noValidate className="space-y-4">
      {globalError && <FormAlert>{globalError}</FormAlert>}

      <Field htmlFor="profile-new-password" label={tr("admin.profile.newPassword")} required layout="stacked" error={passwordError}>
        <TextInput
          id="profile-new-password"
          type="password"
          name="password"
          required
          aria-describedby={passwordError ? "profile-new-password-error" : undefined}
        />
      </Field>

      <SubmitButton label={tr("admin.profile.changePassword")} pendingLabel={tr("admin.common.saving")} />
    </form>
  );
}
