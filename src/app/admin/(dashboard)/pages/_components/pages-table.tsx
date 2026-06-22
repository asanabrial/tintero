"use client";

import { useState } from "react";
import type { Page } from "@/lib/content/types";
import { Button } from "@/app/components/ui/button";
import { useColumnVisibility } from "../../_components/use-column-visibility";
import { useT } from "@/lib/i18n/provider";

// WordPress "Screen Options" — toggleable columns for the pages list (Title is
// always shown; persisted via useColumnVisibility under this key).
const COLUMNS_STORAGE_KEY = "tintero-pages-hidden-columns";
const TOGGLE_COLUMNS = [
  { key: "slug", label: "Slug" },
  { key: "date", label: "Date" },
  { key: "status", label: "Status" },
  { key: "order", label: "Order" },
] as const;

export function PagesTable({
  pages,
  bulkDeleteAction,
  bulkSetStatusAction,
  quickEditAction,
}: {
  pages: Page[];
  bulkDeleteAction: (formData: FormData) => void | Promise<void>;
  bulkSetStatusAction: (formData: FormData) => void | Promise<void>;
  /** WordPress-style Quick Edit — updates Title/Slug/Date/Status/Order inline. */
  quickEditAction?: (formData: FormData) => void | Promise<void>;
}) {
  const tr = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // WordPress-style single "Bulk actions" dropdown: pick one action, click Apply.
  const [bulkAction, setBulkAction] = useState<"" | "publish" | "draft" | "trash">("");
  // WordPress-style Quick Edit — slug of the row currently being inline-edited.
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  // Screen Options — column visibility (persisted in localStorage, no SSR mismatch).
  const [screenOptionsOpen, setScreenOptionsOpen] = useState(false);
  const { isVisible, toggleColumn } = useColumnVisibility(COLUMNS_STORAGE_KEY);

  // Localized column labels
  const COLUMN_LABELS: Record<string, string> = {
    slug: tr("admin.table.colSlug"),
    date: tr("admin.table.colDate"),
    status: tr("admin.table.colStatus"),
    order: tr("admin.table.colOrder"),
  };

  // colSpan for the inline Quick Edit row: checkbox + title + visible toggle columns.
  const visibleColumnCount = 2 + TOGGLE_COLUMNS.filter((c) => isVisible(c.key)).length;

  const allSelected = pages.length > 0 && selected.size === pages.length;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(pages.map((p) => p.slug)));

  const toggleOne = (slug: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  return (
    <div>
      {/* WordPress "Screen Options" — a disclosure that toggles column visibility. */}
      <div className="mb-2 flex justify-end">
        <div className="relative">
          <button
            type="button"
            onClick={() => setScreenOptionsOpen((o) => !o)}
            aria-expanded={screenOptionsOpen}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {tr("admin.table.screenOptions")}
          </button>
          {screenOptionsOpen && (
            <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {tr("admin.table.columns")}
              </p>
              <div className="space-y-1.5">
                {TOGGLE_COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                  >
                    <input
                      type="checkbox"
                      checked={isVisible(col.key)}
                      onChange={() => toggleColumn(col.key)}
                    />
                    {COLUMN_LABELS[col.key] ?? col.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WordPress-style tablenav: a single "Bulk actions" dropdown + Apply,
          always visible above the table. */}
      <form
        className="mb-2 flex items-center gap-2"
        action={bulkAction === "trash" ? bulkDeleteAction : bulkSetStatusAction}
        onSubmit={(e) => {
          if (bulkAction === "" || selected.size === 0) {
            e.preventDefault();
            return;
          }
          if (
            bulkAction === "trash" &&
            !window.confirm(tr("admin.table.confirmBulkDeletePages", { count: selected.size }))
          ) {
            e.preventDefault();
          }
        }}
      >
        <label htmlFor="bulk-action-pages" className="sr-only">
          {tr("admin.table.selectBulkAction")}
        </label>
        <select
          id="bulk-action-pages"
          value={bulkAction}
          onChange={(e) => setBulkAction(e.target.value as typeof bulkAction)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="">{tr("admin.table.bulkActions")}</option>
          <option value="publish">{tr("admin.table.setBulkPublished")}</option>
          <option value="draft">{tr("admin.table.setBulkDraft")}</option>
          <option value="trash">{tr("admin.common.deletePermanently")}</option>
        </select>
        {(bulkAction === "publish" || bulkAction === "draft") && (
          <input
            type="hidden"
            name="status"
            value={bulkAction === "publish" ? "published" : "draft"}
          />
        )}
        {[...selected].map((slug) => (
          <input key={slug} type="hidden" name="slug" value={slug} />
        ))}
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={bulkAction === "" || selected.size === 0}
        >
          {tr("admin.common.apply")}
        </Button>
        {selected.size > 0 && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {tr("admin.common.selected", { count: selected.size })}
          </span>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-2.5 px-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        !allSelected && selected.size > 0;
                    }
                  }}
                  onChange={toggleAll}
                  aria-label={tr("admin.pages.selectAll")}
                />
              </th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {tr("admin.table.colTitle")}
              </th>
              {isVisible("slug") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colSlug")}
                </th>
              )}
              {isVisible("date") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colDate")}
                </th>
              )}
              {isVisible("status") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colStatus")}
                </th>
              )}
              {isVisible("order") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colOrder")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => {
              // WordPress Quick Edit — inline form replacing this row.
              if (editingSlug === page.slug && quickEditAction) {
                return (
                  <tr
                    key={page.slug}
                    className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800/60 dark:bg-zinc-800/30"
                  >
                    <td colSpan={visibleColumnCount} className="p-3">
                      <form
                        action={quickEditAction}
                        onSubmit={() => setEditingSlug(null)}
                        className="space-y-3"
                      >
                        <input type="hidden" name="currentSlug" value={page.slug} />
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {tr("admin.table.quickEdit")}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400 lg:col-span-2">
                            {tr("admin.editor.title")}
                            <input
                              type="text"
                              name="title"
                              defaultValue={page.title}
                              required
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {tr("admin.editor.slug")}
                            <input
                              type="text"
                              name="slug"
                              defaultValue={page.slug}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {tr("admin.table.colDate")}
                            <input
                              type="date"
                              name="date"
                              defaultValue={page.date}
                              required
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {tr("admin.editor.status")}
                            <select
                              name="status"
                              defaultValue={page.status}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            >
                              <option value="published">{tr("admin.status.published")}</option>
                              <option value="draft">{tr("admin.status.draft")}</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {tr("admin.editor.order")}
                            <input
                              type="number"
                              name="menuOrder"
                              defaultValue={page.menuOrder ?? 0}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="submit" variant="accent" size="sm">
                            {tr("admin.editor.update")}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingSlug(null)}
                          >
                            {tr("admin.common.cancel")}
                          </Button>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              }

              return (
              <tr
                key={page.slug}
                className="group border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
              >
                <td className="py-2.5 px-3 align-top">
                  <input
                    type="checkbox"
                    checked={selected.has(page.slug)}
                    onChange={() => toggleOne(page.slug)}
                    aria-label={`Select ${page.title}`}
                  />
                </td>
                {/* Title + WordPress-style row actions (revealed on hover/focus). */}
                <td className="py-2.5 px-3 align-top">
                  {page.parent && (
                    <span className="text-zinc-400 dark:text-zinc-500 mr-1">—</span>
                  )}
                  <a
                    href={`/admin/pages/${page.slug}/edit`}
                    className="font-semibold text-[#2271b1] hover:text-[#135e96] dark:text-[#4f94d4] dark:hover:text-[#7bb0e0]"
                  >
                    {page.title}
                  </a>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 dark:text-zinc-400">
                    <a
                      href={`/admin/pages/${page.slug}/edit`}
                      className="hover:text-[#2271b1] dark:hover:text-[#4f94d4]"
                    >
                      {tr("admin.common.edit")}
                    </a>
                    {quickEditAction && (
                      <>
                        <span aria-hidden="true">|</span>
                        <button
                          type="button"
                          onClick={() => setEditingSlug(page.slug)}
                          className="hover:text-[#2271b1] dark:hover:text-[#4f94d4]"
                        >
                          {tr("admin.table.quickEdit")}
                        </button>
                      </>
                    )}
                    <span aria-hidden="true">|</span>
                    <a
                      href={`/pages/${page.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#2271b1] dark:hover:text-[#4f94d4]"
                    >
                      {tr("admin.common.view")}
                    </a>
                    <span aria-hidden="true">|</span>
                    <a
                      href={`/admin/pages/${page.slug}/delete`}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      {tr("admin.common.delete")}
                    </a>
                  </div>
                </td>
                {isVisible("slug") && (
                  <td className="py-2.5 px-3 align-top">
                    <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">
                      {page.slug}
                    </code>
                  </td>
                )}
                {isVisible("date") && (
                  <td className="py-2.5 px-3 align-top text-zinc-700 dark:text-zinc-300">
                    {page.date}
                  </td>
                )}
                {isVisible("status") && (
                  <td className="py-2.5 px-3 align-top">
                    {page.status === "draft" ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        {tr("admin.status.draft")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        {tr("admin.status.published")}
                      </span>
                    )}
                  </td>
                )}
                {isVisible("order") && (
                  <td className="py-2.5 px-3 align-top text-zinc-500 dark:text-zinc-400 text-xs">
                    {page.menuOrder ?? 0}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
