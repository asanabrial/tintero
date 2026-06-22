import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Shared form layer — the single source of truth for admin/site form chrome.
 *
 * Before this module every form re-declared the same 40-character input class
 * string, its own `SubmitButton`, and its own error banner. That drift is why
 * the forms never reached WordPress-level polish: there was no shared rhythm to
 * polish. These primitives encode one rhythm (the `.form-table` label/field
 * cadence, meta-box panels, the two-column editor) so a single change updates
 * every form at once.
 *
 * Nothing here is a client component — they own no state and no hooks, so they
 * render in both server and client trees. The only client piece (the submit
 * button, which needs `useFormStatus`) lives in `./submit-button`.
 */

/** Zero-dependency class joiner — the project intentionally ships no clsx/cva. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** The canonical control skin. Was duplicated 40+ times across forms. */
export const controlClass =
  "block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-colors";

const labelClass =
  "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

// ───────────────────────────── Controls ─────────────────────────────

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, className)} {...props} />;
}

export function SelectInput({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClass, className)} {...props}>
      {children}
    </select>
  );
}

// ───────────────────────────── Field wrapper ─────────────────────────────

type FieldLayout = "stacked" | "table";

interface FieldProps {
  /** The control's id — wires the label and (when present) the error message. */
  htmlFor: string;
  label: ReactNode;
  required?: boolean;
  /** Helper text under the control. */
  hint?: ReactNode;
  /** Validation message; sets `aria-describedby` semantics via the control's id. */
  error?: ReactNode;
  /**
   * `stacked` (default): label above control — compact, good for narrow
   * meta-box sidebars. `table`: WordPress `.form-table` rhythm — label in a
   * fixed left column, control on the right, divider between rows.
   */
  layout?: FieldLayout;
  children: ReactNode;
}

function Asterisk() {
  return (
    <span aria-hidden="true" title="required" className="ml-0.5 text-red-500">
      *
    </span>
  );
}

/**
 * A labelled field. `children` is the control (TextInput/SelectInput/…). The
 * `error`/`hint` slots replace the per-form duplicated markup.
 */
export function Field({
  htmlFor,
  label,
  required,
  hint,
  error,
  layout = "stacked",
  children,
}: FieldProps) {
  const meta = (
    <>
      {hint ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}
    </>
  );

  if (layout === "table") {
    return (
      <div className="border-b border-zinc-100 dark:border-zinc-800 py-3 last:border-0 sm:grid sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start sm:gap-4">
        <label htmlFor={htmlFor} className={cn(labelClass, "sm:pt-2")}>
          {label}
          {required ? <Asterisk /> : null}
        </label>
        <div className="mt-1.5 space-y-1.5 sm:mt-0">
          {children}
          {meta}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
        {required ? <Asterisk /> : null}
      </label>
      {children}
      {meta}
    </div>
  );
}

/** Inline checkbox + label row (the control is its own label here). */
export function CheckboxField({
  id,
  name,
  label,
  defaultChecked,
  value = "on",
}: {
  id: string;
  name: string;
  label: ReactNode;
  defaultChecked?: boolean;
  value?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
    >
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-zinc-900 focus:ring-zinc-500"
      />
      {label}
    </label>
  );
}

// ───────────────────────────── Banners ─────────────────────────────

/** Global form error / success banner — replaces 15+ duplicated alert blocks. */
export function FormAlert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success";
  children: ReactNode;
}) {
  const tones = {
    error:
      "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400",
    success:
      "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400",
  } as const;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "success" ? "polite" : undefined}
      className={cn("rounded-md border px-3 py-2 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}

// ───────────────────────────── Panels & layout ─────────────────────────────

/**
 * WordPress-style meta box: a titled card with a header bar. Used for the
 * editor sidebar boxes (Publish, Tags, Categories, Featured image) and any
 * other grouped panel.
 */
export function MetaBox({
  title,
  children,
  bodyClassName,
}: {
  title: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/30">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
      </header>
      <div className={cn("space-y-4 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * A titled settings section — a panel with an optional description and a
 * subtle header band. Pair with `Field layout="table"` children for the WP
 * settings-page look.
 */
export function FormSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </header>
      <div className="px-5 py-1.5">{children}</div>
    </section>
  );
}

/**
 * Two-column editor shell: a wide main column (title + body) beside a sticky
 * sidebar of meta boxes — the core WordPress edit-post layout. Collapses to a
 * single column below `lg`.
 */
export function EditorLayout({
  main,
  sidebar,
}: {
  main: ReactNode;
  sidebar: ReactNode;
}) {
  return (
    <div className="grid max-w-[80rem] grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">{main}</div>
      <aside className="space-y-4 lg:sticky lg:top-6">{sidebar}</aside>
    </div>
  );
}

/** A submit/action button row. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-3 pt-1">{children}</div>;
}
