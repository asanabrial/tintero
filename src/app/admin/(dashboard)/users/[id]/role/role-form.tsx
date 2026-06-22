"use client";

import { useActionState } from "react";
import type { UserActionState } from "../../actions";
import type { Role } from "@/lib/auth/types";
import { useT } from "@/lib/i18n/provider";
import { Field, FormAlert, SelectInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";

interface RoleFormProps {
  /** Bound server action — updateUserRoleAction pre-bound with the target user id. */
  action: (prevState: UserActionState, formData: FormData) => Promise<UserActionState>;
  /** Current role of the target user — pre-selects the dropdown. */
  currentRole: Role;
  /** Target user's email — displayed as context for the admin. */
  email: string;
}

/**
 * RoleForm — client island for the change-role form.
 * Presentational only: owns form UX (pending state, field/global errors).
 * No data fetching, no auth, no DB imports.
 * Variant is driven by the bound `action` prop (composition pattern — no boolean flags).
 */
export function RoleForm({ action, currentRole, email }: RoleFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<UserActionState, FormData>(
    action,
    undefined
  );

  const globalError =
    state && !state.ok && (!state.field || state.field === "general")
      ? state.error
      : null;

  const roleError =
    state && !state.ok && state.field === "role" ? state.error : null;

  return (
    <form action={dispatch} noValidate className="space-y-4">
      {/* Context: show which user's role is being changed */}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {tr("admin.users.changingRoleFor", { email })}
      </p>

      {/* Guard-level error (e.g., last-admin demotion, self-change) */}
      {globalError && <FormAlert>{globalError}</FormAlert>}

      {/* Role select */}
      <Field htmlFor="user-role" label={tr("admin.users.colRole")} layout="stacked" error={roleError}>
        <SelectInput
          id="user-role"
          name="role"
          defaultValue={currentRole}
          aria-describedby={roleError ? "user-role-error" : undefined}
        >
          <option value="admin">{tr("admin.users.roleAdmin")}</option>
          <option value="editor">{tr("admin.users.roleEditor")}</option>
          <option value="author">{tr("admin.users.roleAuthor")}</option>
        </SelectInput>
      </Field>

      <SubmitButton label={tr("admin.users.changeRole")} pendingLabel={tr("admin.common.saving")} />
    </form>
  );
}
