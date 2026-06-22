"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonVariant } from "./button";
import { cn } from "./form";

/**
 * Shared submit button — replaces the 17 identical copies forms used to define.
 * Reads the enclosing form's pending state via `useFormStatus`, so it must live
 * inside a `<form>`. Shares its skin with `Button`/`ButtonLink` (./button), so
 * every action across the admin looks the same. Defaults to the `accent`
 * (WordPress-blue) primary.
 */
export function SubmitButton({
  label = "Save",
  pendingLabel = "Saving…",
  variant = "accent",
  fullWidth = false,
  name,
  value,
  className,
}: {
  label?: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  /**
   * Optional submit-button name/value. When a form has multiple submit buttons,
   * the activated one contributes its name/value to FormData — this is how the
   * Save Draft / Publish split sets `status` without a separate select.
   */
  name?: string;
  value?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, "md", cn(fullWidth && "w-full", className))}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
