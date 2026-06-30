"use client";

import { useActionState } from "react";
import type { TaxonomyCreateState } from "./actions";
import { Field, FormAlert, TextInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

interface CategoryCreateFormProps {
  action: (prevState: TaxonomyCreateState, formData: FormData) => Promise<TaxonomyCreateState>;
}

export function CategoryCreateForm({ action }: CategoryCreateFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<TaxonomyCreateState, FormData>(action, undefined);

  const globalError = state && !state.ok && state.field === "general" ? state.error : null;
  const labelError = state && !state.ok && state.field === "label" ? state.error : null;

  return (
    <form action={dispatch} noValidate className="max-w-xl space-y-4">
      {globalError && <FormAlert>{tr(globalError)}</FormAlert>}

      <Field
        htmlFor="cat-label"
        label={tr("admin.taxonomy.labelField")}
        required
        layout="stacked"
        error={labelError ? tr(labelError) : null}
        hint={tr("admin.taxonomy.categoryHierarchyHint")}
      >
        <TextInput
          id="cat-label"
          type="text"
          name="label"
          required
          aria-describedby={labelError ? "cat-label-error" : undefined}
          placeholder={tr("admin.taxonomy.labelPlaceholder")}
        />
      </Field>

      <Field htmlFor="cat-description" label={tr("admin.taxonomy.descriptionField")} layout="stacked">
        <TextInput
          id="cat-description"
          type="text"
          name="description"
        />
      </Field>

      <SubmitButton label={tr("admin.taxonomy.addCategoryBtn")} pendingLabel={tr("admin.taxonomy.adding")} />
    </form>
  );
}
