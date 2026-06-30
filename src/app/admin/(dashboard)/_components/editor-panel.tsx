"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/app/components/ui/form";

/**
 * Flat WordPress (Gutenberg)-style settings-panel primitives.
 *
 * Unlike the boxed `MetaBox`/`CollapsibleMetaBox` cards, the Gutenberg panel is
 * one flat white column divided by hairlines: a document summary at the top
 * (Status / Publish / Slug / Author / Discussion … as label→value rows) followed
 * by flat collapsible sections (Categories, Tags, …). These primitives encode
 * that look so the post and page editors match it exactly.
 */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={cn("h-4 w-4 text-zinc-400 transition-transform duration-200", open ? "rotate-180" : "")}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** A flat collapsible section — header row + body, separated by a top hairline. */
export function PanelSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="border-b border-zinc-200 dark:border-zinc-800">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 dark:text-zinc-50 dark:hover:bg-zinc-800/40"
        >
          <span>{title}</span>
          <Chevron open={open} />
        </button>
      </h3>
      {/* Body stays mounted (hidden) so its inputs keep contributing to the form. */}
      <div id={bodyId} hidden={!open} className="space-y-3 px-4 pb-4">
        {children}
      </div>
    </section>
  );
}

/** A static (non-collapsible) flat block — e.g. the featured-image area. */
export function PanelBlock({ children }: { children: ReactNode }) {
  return <div className="space-y-3 border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">{children}</div>;
}

/** A label → value summary row (Gutenberg's Status / Publish / Slug … list). */
export function SummaryRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 pt-0.5 text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="min-w-0 text-right text-zinc-900 dark:text-zinc-100">{children}</span>
    </div>
  );
}

/** The blue "Edit" affordance used to reveal an inline control inside a row. */
export function RowEditButton({
  expanded,
  onClick,
  label,
}: {
  expanded: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="text-[#2271b1] hover:underline dark:text-[#4f94d4]"
    >
      {label}
    </button>
  );
}
