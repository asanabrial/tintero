"use client";

import { useActionState } from "react";
import { updateMediaMetaAction, type MediaMetaFormState } from "./actions";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

interface EditMetaFormProps {
  filename: string;
  initialAlt?: string;
  initialCaption?: string;
}

export function EditMetaForm({ filename, initialAlt, initialCaption }: EditMetaFormProps) {
  const tr = useT();
  const action = updateMediaMetaAction.bind(null, filename);
  const [state, formAction, isPending] = useActionState<MediaMetaFormState, FormData>(
    action,
    undefined
  );

  const altId = `alt-${filename}`;
  const captionId = `caption-${filename}`;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <fieldset disabled={isPending} className="flex flex-col gap-2">
        <label htmlFor={altId} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {tr("admin.media.altText")}
        </label>
        <input
          id={altId}
          name="alt"
          type="text"
          defaultValue={initialAlt ?? ""}
          placeholder={tr("admin.media.describeImage")}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
        />
        <label htmlFor={captionId} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {tr("admin.media.caption")}
        </label>
        <input
          id={captionId}
          name="caption"
          type="text"
          defaultValue={initialCaption ?? ""}
          placeholder={tr("admin.media.optionalCaption")}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500"
        />
        <SubmitButton label={tr("admin.common.save")} pendingLabel={tr("admin.common.saving")} className="self-start" />
      </fieldset>
      {state && "ok" in state && state.ok && (
        <p role="status" className="text-xs text-green-700 dark:text-green-400">{tr("admin.media.savedShort")}</p>
      )}
      {state && "error" in state && state.error && (
        <p role="alert" aria-live="polite" className="text-xs text-red-700 dark:text-red-400">{tr(state.error)}</p>
      )}
    </form>
  );
}
