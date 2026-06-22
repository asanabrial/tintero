"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/provider";

interface MediaGridSelectableProps {
  items: { filename: string }[];
  children: ReactNode[];
  bulkDeleteAction: (formData: FormData) => void | Promise<void>;
}

export function MediaGridSelectable({
  items,
  children,
  bulkDeleteAction,
}: MediaGridSelectableProps) {
  const tr = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelected = items.length > 0 && selected.size === items.length;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.filename)));

  const toggleOne = (filename: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) {
              el.indeterminate = !allSelected && selected.size > 0;
            }
          }}
          onChange={toggleAll}
          aria-label={tr("admin.common.selectAll")}
        />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{tr("admin.common.selectAll")}</span>
      </div>

      {selected.size > 0 && (
        <form
          action={bulkDeleteAction}
          onSubmit={(e) => {
            if (
              !window.confirm(
                tr("admin.media.confirmBulkDelete", { count: selected.size })
              )
            ) {
              e.preventDefault();
            }
          }}
          className="flex items-center gap-3 mb-3 p-2 rounded bg-zinc-50 dark:bg-zinc-800/40"
        >
          {[...selected].map((f) => (
            <input key={f} type="hidden" name="filename" value={f} />
          ))}
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {tr("admin.common.selected", { count: selected.size })}
          </span>
          <button
            type="submit"
            className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
          >
            {tr("admin.media.deleteSelected")}
          </button>
        </form>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {items.map((item, i) => (
          <div key={item.filename} className="relative">
            <input
              type="checkbox"
              className="absolute top-2 left-2 z-10"
              checked={selected.has(item.filename)}
              onChange={() => toggleOne(item.filename)}
              aria-label={`Select ${item.filename}`}
            />
            {children[i]}
          </div>
        ))}
      </div>
    </div>
  );
}
