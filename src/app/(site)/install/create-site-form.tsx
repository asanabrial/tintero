"use client";

import { useActionState } from "react";
import { createSiteAction } from "./actions";
import type { CreateSiteState } from "./actions";
import { Field, TextInput, Textarea, FormAlert } from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";

/**
 * CreateSiteForm — client island for the install wizard's final step.
 * Collects site title, description, admin email and password.
 * Mirrors login-form.tsx patterns: useActionState, zinc/dark styling,
 * per-field errors, role="alert" for top-level errors, pending state on submit.
 */
export function CreateSiteForm() {
  const [state, dispatch] = useActionState<
    CreateSiteState | undefined,
    FormData
  >(createSiteAction, undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Create your site
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Set up your site and create the first admin account.
        </p>
      </div>

      <form action={dispatch} className="space-y-4">
        {/* Site title */}
        <Field
          htmlFor="title"
          label="Site title"
          required
          layout="stacked"
          error={state?.errors?.title}
        >
          <TextInput
            id="title"
            type="text"
            name="title"
            required
            autoComplete="off"
          />
        </Field>

        {/* Site description */}
        <Field
          htmlFor="description"
          label="Description"
          layout="stacked"
        >
          <Textarea
            id="description"
            name="description"
            rows={2}
            autoComplete="off"
            className="resize-none"
          />
        </Field>

        <hr className="border-zinc-200 dark:border-zinc-800" />

        {/* Admin email */}
        <Field
          htmlFor="email"
          label="Admin email"
          required
          layout="stacked"
          error={state?.errors?.email}
        >
          <TextInput
            id="email"
            type="email"
            name="email"
            required
            autoComplete="email"
          />
        </Field>

        {/* Admin password */}
        <Field
          htmlFor="password"
          label="Password"
          required
          layout="stacked"
          error={state?.errors?.password}
        >
          <TextInput
            id="password"
            type="password"
            name="password"
            required
            autoComplete="new-password"
          />
        </Field>

        {/* Top-level / form error */}
        {state?.formError && (
          <FormAlert tone="error">{state.formError}</FormAlert>
        )}

        <SubmitButton fullWidth label="Create site" pendingLabel="Creating…" />
      </form>
    </div>
  );
}
