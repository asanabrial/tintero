"use client";

import { useId, useState } from "react";
import { cn } from "./form";

/**
 * Collapsible meta box — the WordPress editor convention where each sidebar
 * panel header is a toggle that folds the body away. Header chrome matches the
 * static `MetaBox` so the two can sit side by side. Collapse state is local
 * (not persisted) — enough to declutter a tall sidebar.
 */
export function CollapsibleMetaBox({
  title,
  defaultOpen = true,
  children,
  bodyClassName,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex w-full items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 text-left text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/30 dark:text-zinc-50 dark:hover:bg-zinc-800/60"
        >
          <span>{title}</span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={cn(
              "h-4 w-4 text-zinc-400 transition-transform duration-200",
              open ? "rotate-180" : "rotate-0"
            )}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </h2>
      {/* Body stays mounted (just hidden) so its inputs keep contributing to the
          form even while collapsed. */}
      <div
        id={bodyId}
        hidden={!open}
        className={cn("space-y-4 p-4", bodyClassName)}
      >
        {children}
      </div>
    </section>
  );
}
