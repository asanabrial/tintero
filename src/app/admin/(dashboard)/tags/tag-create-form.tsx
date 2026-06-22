"use client";

import { useActionState } from "react";
import type { TaxonomyCreateState } from "./actions";
import { Field, FormAlert, TextInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

interface TagCreateFormProps {
  action: (prevState: TaxonomyCreateState, formData: FormData) => Promise<TaxonomyCreateState>;
}

export function TagCreateForm({ action }: TagCreateFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<TaxonomyCreateState, FormData>(action, undefined);

  const globalError = state && !state.ok && state.field === "general" ? state.error : null;
  const labelError = state && !state.ok && state.field === "label" ? state.error : null;

  return (
    <form action={dispatch} noValidate className="max-w-xl space-y-4">
      {globalError && <FormAlert>{globalError}</FormAlert>}

      <Field htmlFor="tag-label" label={tr("admin.taxonomy.labelField")} required layout="stacked" error={labelError}>
        <TextInput
          id="tag-label"
          type="text"
          name="label"
          required
          aria-describedby={labelError ? "tag-label-error" : undefined}
          placeholder={tr("admin.taxonomy.tagLabelPlaceholder")}
        />
      </Field>

      <Field htmlFor="tag-description" label={tr("admin.taxonomy.descriptionField")} layout="stacked">
        <TextInput
          id="tag-description"
          type="text"
          name="description"
        />
      </Field>

      <SubmitButton label={tr("admin.taxonomy.addTagBtn")} pendingLabel={tr("admin.taxonomy.adding")} />
    </form>
  );
}
