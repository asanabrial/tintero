"use client";

import { useActionState } from "react";
import type { ProfileActionState } from "./actions";
import { useT } from "@/lib/i18n/provider";
import { Field, FormAlert, Textarea, TextInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";

interface ProfileInfoFormProps {
  action: (prev: ProfileActionState, formData: FormData) => Promise<ProfileActionState>;
  defaultName: string | null;
  defaultBio: string | null;
}

export function ProfileInfoForm({ action, defaultName, defaultBio }: ProfileInfoFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<ProfileActionState, FormData>(action, undefined);

  const globalError =
    state && !state.ok && (!state.field || state.field === "general") ? state.error : null;

  return (
    <form action={dispatch} noValidate className="space-y-4">
      {globalError && <FormAlert>{tr(globalError)}</FormAlert>}

      <Field htmlFor="profile-display-name" label={<>{tr("admin.profile.displayName")} <span className="text-zinc-400 font-normal">{tr("common.fieldOptional")}</span></>} layout="stacked">
        <TextInput
          id="profile-display-name"
          type="text"
          name="name"
          defaultValue={defaultName ?? ""}
        />
      </Field>

      <Field htmlFor="profile-bio" label={<>{tr("admin.profile.bio")} <span className="text-zinc-400 font-normal">{tr("common.fieldOptional")}</span></>} layout="stacked">
        <Textarea
          id="profile-bio"
          name="bio"
          rows={4}
          defaultValue={defaultBio ?? ""}
          className="resize-none"
        />
      </Field>

      <SubmitButton label={tr("admin.profile.saveProfile")} pendingLabel={tr("admin.common.saving")} />
    </form>
  );
}
