"use client";

import { useActionState } from "react";
import type { TaxonomyActionState } from "../../actions";
import { mergeTagAction } from "../../actions";
import { Field, FormAlert, SelectInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

interface MergeTagFormProps {
  rawLabel: string;
  otherTags: { label: string; slug: string }[];
}

/**
 * MergeTagForm — client island for tag merge.
 * Hidden `value` input carries the source raw label.
 * `target` select lists all other existing tag labels.
 * Renders inline error or failure report from useActionState.
 */
export function MergeTagForm({ rawLabel, otherTags }: MergeTagFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<TaxonomyActionState, FormData>(
    mergeTagAction,
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
        {otherTags.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{tr("admin.taxonomy.noOtherAvailable", { type: tr("admin.taxonomy.tagsTitle").toLowerCase() })}</p>
        ) : (
          <SelectInput id="merge-target" name="target" required>
            {otherTags.map((tag) => (
              <option key={tag.slug} value={tag.label}>
                {tag.label}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>

      <SubmitButton label={tr("admin.taxonomy.mergeIntoTarget")} pendingLabel={tr("admin.taxonomy.mergingLabel")} />
    </form>
  );
}
