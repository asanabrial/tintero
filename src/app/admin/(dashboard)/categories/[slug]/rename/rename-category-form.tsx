"use client";

import { useActionState } from "react";
import type { TaxonomyActionState } from "../../actions";
import { renameCategoryAction } from "../../actions";
import { Field, FormAlert, TextInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

interface RenameCategoryFormProps {
  rawLabel: string;
}

/**
 * RenameCategoryForm — client island for category rename.
 * Prefilled with the current raw label as the new-name default.
 * Hidden `value` input carries the current raw string for the server action.
 * Renders inline error or failure report from useActionState.
 */
export function RenameCategoryForm({ rawLabel }: RenameCategoryFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<TaxonomyActionState, FormData>(
    renameCategoryAction,
    undefined
  );

  return (
    <form action={dispatch} className="space-y-4">
      {/* Hidden: current raw label — action matches on this exact string */}
      <input type="hidden" name="value" value={rawLabel} />

      {/* Inline error */}
      {state && !state.ok && state.error && (
        <FormAlert>{state.error}</FormAlert>
      )}

      {/* Partial failure report */}
      {state && !state.ok && state.report && (
        <FormAlert>
          <p>
            {state.report.succeeded.length} post(s) updated,{" "}
            {state.report.failed.length} failed.
          </p>
          {state.report.failed.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {state.report.failed.map((f) => (
                <li key={f.slug}>
                  {f.slug}: {f.error}
                </li>
              ))}
            </ul>
          )}
        </FormAlert>
      )}

      <Field htmlFor="rename-new-value" label={tr("admin.taxonomy.newName")} layout="stacked">
        <TextInput
          id="rename-new-value"
          type="text"
          name="newValue"
          defaultValue={rawLabel}
          required
        />
      </Field>

      <SubmitButton label={tr("admin.taxonomy.renameHeading")} pendingLabel={tr("admin.taxonomy.renamingLabel")} />
    </form>
  );
}
