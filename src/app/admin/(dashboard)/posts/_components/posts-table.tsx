"use client";

import { useState } from "react";
import type { Post } from "@/lib/content/types";
import { derivePostDisplayStatus } from "@/lib/content/schedule";
import type { AssessmentScore } from "@/lib/seo/analysis";
import { Button } from "@/app/components/ui/button";
import { useColumnVisibility } from "../../_components/use-column-visibility";
import { useT } from "@/lib/i18n/provider";

const SEO_DOT: Record<AssessmentScore, string> = {
  good: "bg-green-500",
  ok: "bg-amber-500",
  bad: "bg-red-500",
};

const STATUS_BADGE: Record<string, string> = {
  Published: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  Draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Scheduled: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

// WordPress "Screen Options" — toggle which columns show (persisted via
// useColumnVisibility under this key; empty = all shown).
const COLUMNS_STORAGE_KEY = "tintero-posts-hidden-columns";

const TOGGLE_COLUMNS = [
  { key: "author", label: "Author" },
  { key: "categories", label: "Categories" },
  { key: "tags", label: "Tags" },
  { key: "comments", label: "Comments" },
  { key: "seo", label: "SEO" },
  { key: "readability", label: "Readability" },
  { key: "date", label: "Date" },
] as const;

export function PostsTable({
  posts,
  now,
  commentCounts,
  seoScores,
  readabilityScores,
  bulkDeleteAction,
  bulkSetStatusAction,
  quickEditAction,
}: {
  posts: Post[];
  now: string;
  /** Approved-comment count per post slug (WP comment-bubble column). */
  commentCounts?: Record<string, number>;
  /** Overall SEO bullet per post slug (Yoast-style SEO column); null = no keyphrase. */
  seoScores?: Record<string, AssessmentScore | null>;
  /** Overall readability bullet per post slug (Yoast-style Readability column). */
  readabilityScores?: Record<string, AssessmentScore>;
  bulkDeleteAction: (formData: FormData) => void | Promise<void>;
  bulkSetStatusAction: (formData: FormData) => void | Promise<void>;
  /** WordPress-style Quick Edit — updates Title/Slug/Date/Status inline. */
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

  // Localized column labels (keyed by TOGGLE_COLUMNS key)
  const COLUMN_LABELS: Record<string, string> = {
    author: tr("admin.table.colAuthor"),
    categories: tr("admin.table.colCategories"),
    tags: tr("admin.table.colTags"),
    comments: tr("admin.table.colComments"),
    seo: tr("admin.table.colSeo"),
    readability: tr("admin.table.colReadability"),
    date: tr("admin.table.colDate"),
  };

  // Status label lookup — maps English display value to localized string.
  const STATUS_LABELS: Record<string, string> = {
    Published: tr("admin.status.published"),
    Draft: tr("admin.status.draft"),
    Scheduled: tr("admin.status.scheduled"),
  };

  // colSpan for the inline Quick Edit row: checkbox + title + visible toggles + status.
  const visibleColumnCount =
    2 + TOGGLE_COLUMNS.filter((c) => isVisible(c.key)).length + 1;

  const allSelected = posts.length > 0 && selected.size === posts.length;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(posts.map((p) => p.slug)));

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
          always visible above the table. The chosen action submits to the
          matching server action with the checked rows' slugs. */}
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
            !window.confirm(tr("admin.table.confirmBulkDelete", { count: selected.size }))
          ) {
            e.preventDefault();
          }
        }}
      >
        <label htmlFor="bulk-action" className="sr-only">
          {tr("admin.table.selectBulkAction")}
        </label>
        <select
          id="bulk-action"
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
                  onChange={toggleAll}
                  aria-label={tr("admin.posts.selectAll")}
                />
              </th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {tr("admin.table.colTitle")}
              </th>
              {isVisible("author") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colAuthor")}
                </th>
              )}
              {isVisible("categories") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colCategories")}
                </th>
              )}
              {isVisible("tags") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colTags")}
                </th>
              )}
              {isVisible("comments") && (
                <th className="py-2.5 px-3 text-center text-zinc-500 dark:text-zinc-400" title={tr("admin.table.colComments")}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="mx-auto h-4 w-4"
                  >
                    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
                  </svg>
                  <span className="sr-only">{tr("admin.table.colComments")}</span>
                </th>
              )}
              {isVisible("seo") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colSeo")}
                </th>
              )}
              {isVisible("readability") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colReadability")}
                </th>
              )}
              {isVisible("date") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.table.colDate")}
                </th>
              )}
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {tr("admin.table.colStatus")}
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => {
              const display = derivePostDisplayStatus(post, now);

              // WordPress Quick Edit — inline form replacing this row.
              if (editingSlug === post.slug && quickEditAction) {
                return (
                  <tr
                    key={post.slug}
                    className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800/60 dark:bg-zinc-800/30"
                  >
                    <td colSpan={visibleColumnCount} className="p-3">
                      <form
                        action={quickEditAction}
                        onSubmit={() => setEditingSlug(null)}
                        className="space-y-3"
                      >
                        <input type="hidden" name="currentSlug" value={post.slug} />
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          {tr("admin.table.quickEdit")}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {tr("admin.editor.title")}
                            <input
                              type="text"
                              name="title"
                              defaultValue={post.title}
                              required
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {tr("admin.editor.slug")}
                            <input
                              type="text"
                              name="slug"
                              defaultValue={post.slug}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {tr("admin.table.colDate")}
                            <input
                              type="date"
                              name="date"
                              defaultValue={post.date}
                              required
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {tr("admin.editor.status")}
                            <select
                              name="status"
                              defaultValue={post.status}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            >
                              <option value="published">{tr("admin.status.published")}</option>
                              <option value="draft">{tr("admin.status.draft")}</option>
                            </select>
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
                  key={post.slug}
                  className="group border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="py-2.5 px-3 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(post.slug)}
                      onChange={() => toggleOne(post.slug)}
                      aria-label={`Select ${post.title}`}
                    />
                  </td>
                  {/* Title + WordPress-style row actions (revealed on hover/focus). */}
                  <td className="py-2.5 px-3 align-top">
                    <a
                      href={`/admin/posts/${post.slug}/edit`}
                      className="font-semibold text-[#2271b1] hover:text-[#135e96] dark:text-[#4f94d4] dark:hover:text-[#7bb0e0]"
                    >
                      {post.title}
                    </a>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 dark:text-zinc-400">
                      <a
                        href={`/admin/posts/${post.slug}/edit`}
                        className="hover:text-[#2271b1] dark:hover:text-[#4f94d4]"
                      >
                        {tr("admin.common.edit")}
                      </a>
                      {quickEditAction && (
                        <>
                          <span aria-hidden="true">|</span>
                          <button
                            type="button"
                            onClick={() => setEditingSlug(post.slug)}
                            className="hover:text-[#2271b1] dark:hover:text-[#4f94d4]"
                          >
                            {tr("admin.table.quickEdit")}
                          </button>
                        </>
                      )}
                      <span aria-hidden="true">|</span>
                      <a
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[#2271b1] dark:hover:text-[#4f94d4]"
                      >
                        {tr("admin.common.view")}
                      </a>
                      <span aria-hidden="true">|</span>
                      <a
                        href={`/admin/posts/${post.slug}/delete`}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        {tr("admin.table.trash")}
                      </a>
                    </div>
                  </td>
                  {isVisible("author") && (
                    <td className="py-2.5 px-3 align-top text-zinc-700 dark:text-zinc-300">
                      {post.author || <span className="text-zinc-400">—</span>}
                    </td>
                  )}
                  {isVisible("categories") && (
                    <td className="py-2.5 px-3 align-top text-zinc-600 dark:text-zinc-400">
                      {post.categories.length > 0 ? (
                        post.categories.join(", ")
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  )}
                  {isVisible("tags") && (
                    <td className="py-2.5 px-3 align-top text-zinc-600 dark:text-zinc-400">
                      {post.tags.length > 0 ? (
                        post.tags.join(", ")
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  )}
                  {isVisible("comments") && (
                    <td className="py-2.5 px-3 align-top text-center">
                      {(() => {
                        const n = commentCounts?.[post.slug] ?? 0;
                        const bubble = (
                          <span
                            className={`inline-flex min-w-[1.5rem] items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                              n > 0
                                ? "bg-[#2271b1] text-white"
                                : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                            }`}
                          >
                            {n}
                          </span>
                        );
                        return n > 0 ? (
                          <a href="/admin/comments" title={tr("admin.table.approvedCommentsCount", { n })}>
                            {bubble}
                          </a>
                        ) : (
                          <span title={tr("admin.table.noApprovedComments")}>{bubble}</span>
                        );
                      })()}
                    </td>
                  )}
                  {isVisible("seo") && (
                    <td className="py-2.5 px-3 align-top">
                      {(() => {
                        const score = seoScores?.[post.slug] ?? null;
                        return score ? (
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${SEO_DOT[score]}`}
                            title={`SEO: ${score}`}
                            aria-label={`SEO score: ${score}`}
                          />
                        ) : (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-600"
                            title={tr("admin.table.noFocusKeyphrase")}
                            aria-label={tr("admin.table.seoNotAnalyzed")}
                          />
                        );
                      })()}
                    </td>
                  )}
                  {isVisible("readability") && (
                    <td className="py-2.5 px-3 align-top">
                      {(() => {
                        const score = readabilityScores?.[post.slug];
                        return score ? (
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${SEO_DOT[score]}`}
                            title={`Readability: ${score}`}
                            aria-label={`Readability score: ${score}`}
                          />
                        ) : (
                          <span className="text-zinc-400">—</span>
                        );
                      })()}
                    </td>
                  )}
                  {isVisible("date") && (
                    <td className="py-2.5 px-3 align-top text-zinc-700 dark:text-zinc-300">{post.date}</td>
                  )}
                  <td className="py-2.5 px-3 align-top">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_BADGE[display]}`}>
                      {STATUS_LABELS[display] ?? display}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
