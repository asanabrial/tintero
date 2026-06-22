"use client";

import { useActionState } from "react";
import type { TaxonomyActionState } from "../../actions";
import { mergeCategoryAction } from "../../actions";
import { Field, FormAlert, SelectInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

interface MergeCategoryFormProps {
  rawLabel: string;
  otherCategories: { label: string; slug: string }[];
}

/**
 * MergeCategoryForm — client island for category merge.
 * Hidden `value` input carries the source raw label.
 * `target` select lists all other existing category labels.
 * Renders inline error or failure report from useActionState.
 */
export function MergeCategoryForm({
  rawLabel,
  otherCategories,
}: MergeCategoryFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<TaxonomyActionState, FormData>(
    mergeCategoryAction,
    undefined
  );

  return (
    <form action={dispatch} className="space-y-4">
      {/* Hidden: source raw label */}
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

      <Field htmlFor="merge-target" label={tr("admin.taxonomy.mergeInto")} layout="stacked">
        {otherCategories.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{tr("admin.taxonomy.noOtherAvailable", { type: tr("admin.taxonomy.categoriesTitle").toLowerCase() })}</p>
        ) : (
          <SelectInput id="merge-target" name="target" required>
            {otherCategories.map((cat) => (
              <option key={cat.slug} value={cat.label}>
                {cat.label}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>

      <SubmitButton label={tr("admin.taxonomy.mergeIntoTarget")} pendingLabel={tr("admin.taxonomy.mergingLabel")} />
    </form>
  );
}
