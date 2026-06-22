// Server component — NO "use client". Renders a colored line-level diff.
// React escapes all text values automatically (XSS-safe).

import type { DiffLine } from "@/lib/revisions/diff";

const ROW_STYLES: Record<DiffLine["kind"], string> = {
  add: "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300",
  remove: "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300",
  same: "text-zinc-700 dark:text-zinc-300",
};

const PREFIX: Record<DiffLine["kind"], string> = {
  add: "+",
  remove: "-",
  same: " ",
};

export function RevisionDiff({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-xs font-mono leading-relaxed">
      {lines.map((line, idx) => (
        <div
          key={idx}
          className={`flex whitespace-pre-wrap break-words px-3 py-0.5 ${ROW_STYLES[line.kind]}`}
        >
          <span aria-hidden className="select-none w-4 shrink-0 opacity-60">
            {PREFIX[line.kind]}
          </span>
          <span className="flex-1">{line.text === "" ? " " : line.text}</span>
        </div>
      ))}
    </div>
  );
}
