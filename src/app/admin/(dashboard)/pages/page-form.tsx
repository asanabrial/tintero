"use client";

import { useState, useActionState } from "react";
import type { PageFormState } from "./actions";
import { Calamo } from "calamo";
import { renderPreviewAction } from "../_components/editor-actions";
import { listMediaAction } from "../media/actions";
import {
  Field,
  TextInput,
  Textarea,
  SelectInput,
  FormAlert,
  MetaBox,
  EditorLayout,
} from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { CollapsibleMetaBox } from "@/app/components/ui/collapsible-meta-box";
import { SeoMetaBox } from "../_components/seo-meta-box";
import { useT } from "@/lib/i18n/provider";

/** Lightweight slug preview — mirrors the server's "blank slug → from title". */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export interface PageFormInitial {
  title?: string;
  slug?: string;
  date?: string;
  status?: string;
  excerpt?: string;
  body?: string;
  parent?: string;
  menuOrder?: number;
  seo?: {
    title?: string;
    metaDescription?: string;
    focusKeyphrase?: string;
    canonical?: string;
    noindex?: boolean;
    ogImage?: string;
    cornerstone?: boolean;
  };
}

interface PageFormProps {
  /** Bound server action — createPageAction or updatePageAction. */
  action: (prevState: PageFormState, formData: FormData) => Promise<PageFormState>;
  /** Initial field values for edit prefill. */
  initial?: PageFormInitial;
  /** Hidden identity field for edit — the current slug being edited. */
  currentSlug?: string;
  /** List of all pages — used to populate the Parent select. */
  pages?: { slug: string; title: string }[];
  /** Site base URL — used to render the permalink preview under the title. */
  baseUrl?: string;
}

/**
 * PageForm — client island for create/edit page forms.
 * Presentational only: owns form UX (pending state, field/global errors).
 * No data fetching, no auth, no FS imports.
 * Fields: title, status, parent (optional), order, slug (optional), date, excerpt, body.
 * Variant is controlled by the `action` prop (composition pattern — not a boolean isEdit flag).
 */
export function PageForm({ action, initial, currentSlug, pages, baseUrl }: PageFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<PageFormState, FormData>(action, undefined);
  // Title + slug are controlled so the permalink preview stays live.
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  // WordPress "Publish" box — Status/Date collapse to summary lines with inline
  // "Edit" toggles. Named inputs are hidden and always submit the current state.
  const [status, setStatus] = useState(initial?.status ?? "published");
  const [date, setDate] = useState(initial?.date ?? "");
  const [editStatus, setEditStatus] = useState(false);
  const [editDate, setEditDate] = useState(false);
  // Description (excerpt) controlled so the SEO box can analyze it live.
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const statusLabel = status === "draft" ? tr("admin.status.draft") : tr("admin.status.published");

  const permalinkSlug = slug.trim() || slugify(title) || "page-slug";
  const permalink = `${(baseUrl ?? "").replace(/\/$/, "")}/pages/${permalinkSlug}`;

  return (
    <form action={dispatch} noValidate className="space-y-4">
      {/* Hidden: current slug for edit identity */}
      {currentSlug && (
        <input type="hidden" name="currentSlug" value={currentSlug} />
      )}

      {/* Global error banner */}
      {state?.error && <FormAlert>{tr(state.error)}</FormAlert>}

      <EditorLayout
        main={
          <>
            {/* Title */}
            <Field htmlFor="page-title" label={tr("admin.editor.title")} required>
              <TextInput
                id="page-title"
                type="text"
                name="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            {/* Permalink preview (WordPress shows the live URL under the title) */}
            <p className="-mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {tr("admin.editor.permalink")}:{" "}
              <span className="break-all text-zinc-700 dark:text-zinc-300">
                {permalink}
              </span>
            </p>

            {/* Body */}
            <Field htmlFor="page-body" label={tr("admin.editor.body")} required>
              <Calamo
                name="body"
                id="page-body"
                defaultValue={initial?.body ?? ""}
                renderPreview={renderPreviewAction}
                listMedia={listMediaAction}
              />
            </Field>

            {/* Description (stored as the page excerpt; powers SEO meta, listings). */}
            <Field htmlFor="page-excerpt" label={tr("admin.editor.description")}>
              <Textarea
                id="page-excerpt"
                name="excerpt"
                rows={2}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
              />
            </Field>
          </>
        }
        sidebar={
          <>
            {/* Publish */}
            <MetaBox title={tr("admin.editor.publish")}>
              {/* Named inputs are hidden and always carry the current state, so
                  collapsing a summary line never drops the submitted value. */}
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="date" value={date} />

              {/* Status — WordPress summary line + inline Edit toggle. */}
              <div className="flex items-start justify-between gap-2 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  {tr("admin.editor.status")}:{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {statusLabel}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditStatus((o) => !o)}
                  aria-expanded={editStatus}
                  className="text-[#2271b1] hover:underline dark:text-[#4f94d4]"
                >
                  {tr("admin.common.edit")}
                </button>
              </div>
              {editStatus && (
                <div className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <label htmlFor="page-status" className="sr-only">
                    {tr("admin.editor.status")}
                  </label>
                  <SelectInput
                    id="page-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="published">{tr("admin.status.published")}</option>
                    <option value="draft">{tr("admin.status.draft")}</option>
                  </SelectInput>
                </div>
              )}

              {/* Publish date — WordPress summary line + inline Edit toggle. */}
              <div className="flex items-start justify-between gap-2 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  {tr("admin.editor.publishOn")}:{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {date || "—"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditDate((o) => !o)}
                  aria-expanded={editDate}
                  className="text-[#2271b1] hover:underline dark:text-[#4f94d4]"
                >
                  {tr("admin.common.edit")}
                </button>
              </div>
              {editDate && (
                <div className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <label htmlFor="page-date" className="sr-only">
                    {tr("admin.editor.publishDate")}
                  </label>
                  <TextInput
                    id="page-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <SubmitButton
                  variant="accent"
                  label={currentSlug ? tr("admin.editor.update") : tr("admin.common.save")}
                  pendingLabel={currentSlug ? tr("admin.editor.updating") : tr("admin.common.saving")}
                />
                <div className="flex items-center justify-between">
                  {currentSlug ? (
                    <a
                      href={`/admin/pages/${currentSlug}/preview`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                      {tr("admin.editor.preview")}
                    </a>
                  ) : (
                    <span />
                  )}
                  {currentSlug ? (
                    <a
                      href={`/admin/pages/${currentSlug}/delete`}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      {tr("admin.editor.moveToTrash")}
                    </a>
                  ) : null}
                </div>
              </div>
            </MetaBox>

            {/* Page attributes */}
            <CollapsibleMetaBox title={tr("admin.editor.pageAttributes")}>
              {pages && pages.length > 0 && (
                <Field htmlFor="page-parent" label={tr("admin.editor.parent")}>
                  <SelectInput
                    id="page-parent"
                    name="parent"
                    defaultValue={initial?.parent ?? ""}
                  >
                    <option value="">{tr("admin.editor.parentNone")}</option>
                    {pages
                      .filter((p) => p.slug !== currentSlug)
                      .map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.title}
                        </option>
                      ))}
                  </SelectInput>
                </Field>
              )}

              <Field htmlFor="page-menu-order" label={tr("admin.editor.order")}>
                <TextInput
                  id="page-menu-order"
                  type="number"
                  name="menuOrder"
                  min="0"
                  defaultValue={initial?.menuOrder ?? 0}
                />
              </Field>
            </CollapsibleMetaBox>

            {/* Details */}
            <CollapsibleMetaBox title={tr("admin.editor.details")} defaultOpen={false}>
              <Field htmlFor="page-slug" label={tr("admin.editor.slug")}>
                <TextInput
                  id="page-slug"
                  type="text"
                  name="slug"
                  placeholder={tr("admin.editor.slugPlaceholder")}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </Field>
            </CollapsibleMetaBox>

            {/* SEO — Yoast-style snippet preview + focus-keyphrase analysis */}
            <CollapsibleMetaBox title={tr("admin.editor.seo")}>
              <SeoMetaBox
                title={title}
                slug={permalinkSlug}
                description={excerpt}
                baseUrl={baseUrl}
                urlPrefix="pages"
                initialSeo={initial?.seo}
              />
            </CollapsibleMetaBox>
          </>
        }
      />
    </form>
  );
}
