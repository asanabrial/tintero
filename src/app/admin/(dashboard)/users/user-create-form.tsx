"use client";

import { useActionState } from "react";
import type { UserActionState } from "./actions";
import { useT } from "@/lib/i18n/provider";
import { Field, FormAlert, SelectInput, TextInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";

interface UserCreateFormProps {
  /** Bound server action — createUserAction. Accepts variant via prop, not a boolean flag. */
  action: (prevState: UserActionState, formData: FormData) => Promise<UserActionState>;
}

/**
 * UserCreateForm — client island for the create-user form.
 * Presentational only: owns form UX (pending state, field/global errors).
 * No data fetching, no auth, no DB imports.
 * Variant is driven by the `action` prop (composition pattern — no boolean flags).
 */
export function UserCreateForm({ action }: UserCreateFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<UserActionState, FormData>(
    action,
    undefined
  );

  // Guard-level (non-field) errors: self-delete, last-admin, auth
  const globalError =
    state && !state.ok && (!state.field || state.field === "general")
      ? state.error
      : null;

  const emailError =
    state && !state.ok && state.field === "email" ? state.error : null;

  const passwordError =
    state && !state.ok && state.field === "password" ? state.error : null;

  return (
    <form action={dispatch} noValidate className="max-w-xl space-y-4">
      {/* Global / guard-level error */}
      {globalError && <FormAlert>{tr(globalError)}</FormAlert>}

      {/* Email */}
      <Field htmlFor="user-email" label={tr("admin.users.email")} required layout="stacked" error={emailError ? tr(emailError) : null}>
        <TextInput
          id="user-email"
          type="email"
          name="email"
          required
          aria-describedby={emailError ? "user-email-error" : undefined}
        />
      </Field>

      {/* Password */}
      <Field htmlFor="user-password" label={tr("admin.users.password")} required layout="stacked" error={passwordError ? tr(passwordError) : null}>
        <TextInput
          id="user-password"
          type="password"
          name="password"
          minLength={12}
          required
          aria-describedby={passwordError ? "user-password-error" : undefined}
        />
      </Field>

      {/* Role */}
      <Field htmlFor="user-role" label={tr("admin.users.colRole")} layout="stacked">
        <SelectInput id="user-role" name="role" defaultValue="admin">
          <option value="admin">{tr("admin.users.roleAdmin")}</option>
          <option value="editor">{tr("admin.users.roleEditor")}</option>
          <option value="author">{tr("admin.users.roleAuthor")}</option>
        </SelectInput>
      </Field>

      {/* Display name */}
      <Field htmlFor="user-display-name" label={<>{tr("admin.users.displayName")} <span className="text-zinc-400 font-normal">{tr("common.fieldOptional")}</span></>} layout="stacked">
        <TextInput
          id="user-display-name"
          type="text"
          name="name"
        />
      </Field>

      <SubmitButton label={tr("admin.users.createUser")} pendingLabel={tr("admin.users.creating")} />
    </form>
  );
}
