"use client";

import { useActionState } from "react";
import { unlockPostAction } from "./actions";
import { TextInput, FormAlert } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { t } from "@/lib/i18n";

export function PasswordUnlockForm({ slug, locale }: { slug: string; locale?: string }) {
  const loc = locale ?? "en";
  const [state, dispatch] = useActionState(unlockPostAction, undefined);
  return (
    <form action={dispatch} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <TextInput
        type="password"
        name="password"
        placeholder={t(loc, "common.enterPassword")}
        required
      />
      {state?.error && (
        <FormAlert tone="error">{state.error}</FormAlert>
      )}
      <SubmitButton fullWidth label={t(loc, "common.unlock")} pendingLabel={t(loc, "common.checking")} />
    </form>
  );
}
