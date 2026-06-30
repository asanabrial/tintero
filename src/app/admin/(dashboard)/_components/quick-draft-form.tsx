"use client";

// QuickDraftForm — client island for the Quick Draft dashboard widget.
// Presentational only: owns form UX (pending state, error display).
// No DB, no auth, no barrel imports from @/lib/content.
// The server action is bound in the server component and passed as a prop
// (D4: action bound at server component level to avoid transitive node:fs leak).

import { useActionState } from "react";
import { Field, FormAlert, Textarea, TextInput } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { useT } from "@/lib/i18n/provider";

// PostFormState type defined structurally here (not imported from the "use server" module)
// to prevent any transitive server-only import from reaching the client bundle.
type PostFormState = { error?: string } | undefined;

interface QuickDraftFormProps {
  /** Bound server action — createQuickDraftAction. Passed as prop, never imported here. */
  action: (prevState: PostFormState, formData: FormData) => Promise<PostFormState>;
}

/**
 * QuickDraftForm — renders a title + body form for creating a draft post.
 * On success the server action redirects to the editor; the form is never reset manually.
 * Errors are surfaced in a role="alert" region for accessibility.
 */
export function QuickDraftForm({ action }: QuickDraftFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<PostFormState, FormData>(action, undefined);

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{tr("admin.quickDraft.title")}</h3>
      </div>

      <form action={dispatch} className="p-4 space-y-3">
        {state?.error && <FormAlert>{tr(state.error)}</FormAlert>}

        <Field htmlFor="quick-draft-title" label={tr("admin.quickDraft.draftTitle")} required layout="stacked">
          <TextInput
            id="quick-draft-title"
            type="text"
            name="title"
            required
            placeholder={tr("admin.quickDraft.titlePlaceholder")}
          />
        </Field>

        <Field htmlFor="quick-draft-body" label={tr("admin.quickDraft.content")} required layout="stacked">
          <Textarea
            id="quick-draft-body"
            name="body"
            required
            rows={5}
            placeholder={tr("admin.quickDraft.contentPlaceholder")}
            className="resize-y"
          />
        </Field>

        <SubmitButton label={tr("admin.quickDraft.saveDraft")} pendingLabel={tr("admin.common.saving")} />
      </form>
    </div>
  );
}
