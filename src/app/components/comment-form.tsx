"use client";

import { useActionState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { submitComment } from "@/app/(site)/blog/[...slug]/actions";
import type { CommentActionState } from "@/app/(site)/blog/[...slug]/actions";
import { Field, TextInput, Textarea, FormAlert } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { t } from "@/lib/i18n";

interface CommentFormProps {
  /** ISO timestamp set server-side in CommentsSection — guards against too-fast submissions. */
  formStartedAt: string;
  /** The post slug — passed as a hidden field to the action. */
  postSlug: string;
  locale?: string;
}

/**
 * Client form for submitting a comment.
 *
 * replyTo: read from ?replyTo= search param via useSearchParams().
 * This avoids threading searchParams through the 'use cache' PostPage boundary.
 *
 * Honeypot: .comment-honeypot CSS class (position:absolute, clip, 1px) — NOT display:none.
 * Bots can fill it; if non-empty the server action returns fake success without persisting.
 *
 * Satisfies: REQ-FORM-01..06, REQ-SPAM-01, S-10, S-11.
 */
export function CommentForm({ formStartedAt, postSlug, locale }: CommentFormProps) {
  const loc = locale ?? "en";
  const searchParams = useSearchParams();
  const replyToId = searchParams.get("replyTo");

  const [state, formAction] = useActionState<CommentActionState, FormData>(
    submitComment,
    { status: "idle" }
  );

  // Ref to track the heading label for reply vs comment
  const headingText = replyToId ? t(loc, "common.leaveReply") : t(loc, "common.leaveComment");

  // Scroll to form when replyTo changes
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (replyToId && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [replyToId]);

  // Success state — show message, hide form inputs (REQ-FORM-06 / S-01 / S-02)
  if (state.status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 text-sm text-zinc-700 dark:text-zinc-300"
      >
        {state.pending
          ? t(loc, "common.commentAwaitingModeration")
          : t(loc, "common.commentPosted")}
      </div>
    );
  }

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const globalMessage = state.status === "error" ? state.message : undefined;

  return (
    <>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
        {headingText}
      </h3>
      <form ref={formRef} action={formAction} noValidate className="space-y-4">
        {/* Hidden: post slug */}
        <input type="hidden" name="postSlug" value={postSlug} />

        {/* Hidden: form start time (set server-side in CommentsSection) — REQ-SPAM-03 / REQ-FORM-04 */}
        <input type="hidden" name="form_started_at" defaultValue={formStartedAt} />

        {/* Hidden: parentId for reply forms — read from ?replyTo= searchParam — REQ-FORM-04 */}
        {replyToId && (
          <input type="hidden" name="parentId" value={replyToId} />
        )}

        {/* Honeypot — visually hidden via CSS, NOT display:none or type=hidden — REQ-SPAM-01 / REQ-FORM-04 */}
        <div className="comment-honeypot" aria-hidden="true">
          <label htmlFor="comment-website">{t(loc, "common.website")}</label>
          <input
            type="text"
            id="comment-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Global error message */}
        {globalMessage && (
          <FormAlert tone="error">{globalMessage}</FormAlert>
        )}

        {/* Name — REQ-FORM-04 */}
        <Field
          htmlFor="comment-authorName"
          label={
            <>
              {t(loc, "common.name")}{" "}
              <span className="ml-1 font-normal text-zinc-500">{t(loc, "common.fieldRequired")}</span>
            </>
          }
          required
          layout="stacked"
          error={fieldErrors.authorName?.[0]}
        >
          <TextInput
            type="text"
            id="comment-authorName"
            name="authorName"
            required
            minLength={1}
            maxLength={100}
            aria-describedby={fieldErrors.authorName ? "comment-authorName-error" : undefined}
            aria-invalid={fieldErrors.authorName ? true : undefined}
          />
        </Field>

        {/* Email — REQ-FORM-04 */}
        <Field
          htmlFor="comment-authorEmail"
          label={
            <>
              {t(loc, "common.email")}{" "}
              <span className="ml-1 font-normal text-zinc-500">{t(loc, "common.fieldNotPublished")}</span>
            </>
          }
          required
          layout="stacked"
          error={fieldErrors.authorEmail?.[0]}
        >
          <TextInput
            type="email"
            id="comment-authorEmail"
            name="authorEmail"
            required
            maxLength={254}
            aria-describedby={fieldErrors.authorEmail ? "comment-authorEmail-error" : undefined}
            aria-invalid={fieldErrors.authorEmail ? true : undefined}
          />
        </Field>

        {/* Website (optional) — REQ-FORM-04 */}
        <Field
          htmlFor="comment-authorUrl"
          label={
            <>
              {t(loc, "common.website")}{" "}
              <span className="font-normal text-zinc-500">{t(loc, "common.fieldOptional")}</span>
            </>
          }
          layout="stacked"
          error={fieldErrors.authorUrl?.[0]}
        >
          <TextInput
            type="url"
            id="comment-authorUrl"
            name="authorUrl"
            maxLength={2048}
            aria-describedby={fieldErrors.authorUrl ? "comment-authorUrl-error" : undefined}
            aria-invalid={fieldErrors.authorUrl ? true : undefined}
          />
        </Field>

        {/* Body — REQ-FORM-04 */}
        <Field
          htmlFor="comment-body"
          label={t(loc, "common.commentLabel")}
          required
          layout="stacked"
          error={fieldErrors.body?.[0]}
        >
          <Textarea
            id="comment-body"
            name="body"
            required
            minLength={10}
            maxLength={5000}
            rows={5}
            aria-describedby={fieldErrors.body ? "comment-body-error" : undefined}
            aria-invalid={fieldErrors.body ? true : undefined}
            className="resize-y"
          />
        </Field>

        <div className="flex justify-end">
          <SubmitButton label={t(loc, "common.postComment")} pendingLabel={t(loc, "common.submitting")} />
        </div>
      </form>
    </>
  );
}
