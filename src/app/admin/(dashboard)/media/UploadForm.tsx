"use client";

import { useActionState } from "react";
import { uploadMediaAction } from "./actions";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

export function UploadForm() {
  const tr = useT();
  const [state, formAction, isPending] = useActionState(uploadMediaAction, undefined);

  return (
    <form action={formAction}>
      <fieldset
        disabled={isPending}
        className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3"
      >
        <legend className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 block">{tr("admin.media.uploadImage")}</legend>
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          required
          className="block w-full text-sm text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded-md file:border file:border-zinc-300 dark:file:border-zinc-700 file:bg-white dark:file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 dark:file:text-zinc-300 file:cursor-pointer hover:file:bg-zinc-50 dark:hover:file:bg-zinc-700 transition-colors"
        />
        <SubmitButton label={tr("admin.media.upload")} pendingLabel={tr("admin.media.uploading")} />
      </fieldset>
      {state && "error" in state && state.error && (
        <div
          role="alert"
          aria-live="polite"
          className="mt-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2"
        >
          <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
        </div>
      )}
      {state && "ok" in state && state.ok && (
        <div
          role="status"
          className="mt-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2"
        >
          <p className="text-sm text-green-700 dark:text-green-400">{tr("admin.media.uploadedSuccess")}</p>
        </div>
      )}
    </form>
  );
}
