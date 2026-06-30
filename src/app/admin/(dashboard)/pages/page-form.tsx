"use client";

import { useState, useActionState } from "react";
import type { PageFormState } from "./actions";
import { renderEditorHtmlAction } from "../_components/editor-html-actions";
import { listMediaAction } from "../media/actions";
import {
  Field,
  TextInput,
  Textarea,
  SelectInput,
  FormAlert,
  cn,
} from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { EditorShell } from "../_components/editor-shell";
import { PanelSection, PanelBlock, SummaryRow, RowEditButton } from "../_components/editor-panel";
import { RichEditor } from "../_components/rich-editor";
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
 *
 * Presentational only: owns form UX (pending state, field/global errors).
 * No data fetching, no auth, no FS imports. The variant is controlled by the
 * `action` prop (composition pattern — not a boolean isEdit flag).
 *
 * The chrome is the WordPress (Gutenberg)-style `EditorShell` — same stack as
 * the post editor, with the smaller page field set (no categories/tags/featured
 * image/discussion). EditorShell, its action buttons, and every panel input all
 * render INSIDE this single `<form>`, so the submitted FormData keeps the exact
 * page save contract: title, slug, date, status, excerpt, parent, menuOrder,
 * body, plus the SEO keys emitted by SeoMetaBox. `status` is contributed by the
 * activated submit button (Save draft / Publish), so it is submitted exactly
 * once.
 */
export function PageForm({ action, initial, currentSlug, pages, baseUrl }: PageFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<PageFormState, FormData>(action, undefined);
  // Title + slug are controlled so the doc label, permalink preview, and SEO box
  // stay live.
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  // Publish date collapses to a summary line with an inline "Edit" toggle. The
  // named input is hidden and always submits the current state, so collapsing
  // never drops the value.
  const [date, setDate] = useState(initial?.date ?? "");
  const [editDate, setEditDate] = useState(false);
  // Description (excerpt) is controlled so the SEO box can analyze it live.
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  // Body markdown mirrored from RichEditor — the hidden <input> fires no input
  // event on programmatic value changes, so we lift it here to feed the SEO box.
  const [body, setBody] = useState(initial?.body ?? "");

  // Pages default to published (WordPress page model); only an explicit "draft"
  // is a draft. `status` is submitted by the activated button below — there is no
  // hidden status input, so the field is never submitted twice.
  const status = initial?.status === "draft" ? "draft" : "published";
  const isPublished = status === "published";
  const statusLabel = isPublished
    ? tr("admin.editor.statusPublished")
    : tr("admin.editor.statusDraft");

  const permalinkSlug = slug.trim() || slugify(title) || "page-slug";
  const permalink = `${(baseUrl ?? "").replace(/\/$/, "")}/pages/${permalinkSlug}`;

  // Top-bar Save draft / Publish split — the activated button contributes
  // `status` to FormData (no separate select). The accent (Publish) button is
  // first in the DOM so Enter triggers the primary action; CSS order places it
  // visually on the right.
  const actions = (
    <div className="flex items-center gap-2">
      <SubmitButton
        variant="accent"
        name="status"
        value="published"
        label={isPublished ? tr("admin.editor.update") : tr("admin.editor.publishBtn")}
        pendingLabel={isPublished ? tr("admin.editor.updating") : tr("admin.editor.publishing")}
        className="order-2"
      />
      <SubmitButton
        variant="secondary"
        name="status"
        value="draft"
        label={isPublished ? tr("admin.editor.switchToDraft") : tr("admin.editor.saveDraft")}
        pendingLabel={tr("admin.common.saving")}
        className="order-1"
      />
    </div>
  );

  // Overflow "⋮" menu — Preview + Revisions + Move to Trash. All need a saved
  // page, so the whole menu is omitted for a brand-new (unsaved) page.
  const menuRowClass =
    "flex w-full items-center px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800";
  const options = currentSlug ? (
    <>
      <a
        href={`/admin/pages/${currentSlug}/preview`}
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        className={menuRowClass}
      >
        {tr("admin.editor.preview")}
      </a>
      <a
        href={`/admin/pages/${currentSlug}/revisions`}
        role="menuitem"
        className={menuRowClass}
      >
        {tr("admin.revisions.title")}
      </a>
      <a
        href={`/admin/pages/${currentSlug}/delete`}
        role="menuitem"
        className={cn(menuRowClass, "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20")}
      >
        {tr("admin.editor.moveToTrash")}
      </a>
    </>
  ) : undefined;

  const canvas = (
    <div className="space-y-3">
      {/* Hidden: current slug for edit identity */}
      {currentSlug && <input type="hidden" name="currentSlug" value={currentSlug} />}

      {/* Global error banner */}
      {state?.error && <FormAlert>{tr(state.error)}</FormAlert>}

      {/* Title — large borderless input, WordPress "Add title". */}
      <input
        type="text"
        name="title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={tr("admin.editor.addTitle")}
        aria-label={tr("admin.editor.title")}
        className="w-full border-0 bg-transparent p-0 text-[2rem] font-bold leading-tight text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-0 dark:text-zinc-50 dark:placeholder:text-zinc-700"
      />

      {/* Permalink preview (WordPress shows the live URL under the title). */}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {tr("admin.editor.permalink")}:{" "}
        <span className="break-all text-zinc-700 dark:text-zinc-300">{permalink}</span>
      </p>

      {/* Body — WYSIWYG Visual/Markdown editor; submits markdown via hidden input. */}
      <RichEditor
        name="body"
        id="page-body"
        initialMarkdown={initial?.body ?? ""}
        renderHtml={renderEditorHtmlAction}
        listMedia={listMediaAction}
        onMarkdownChange={setBody}
        placeholder={tr("admin.editor.bodyPlaceholder")}
        ariaLabel={tr("admin.editor.body")}
      />
    </div>
  );

  const panel = (
    <>
      {/* Summary — Status + Publish date (Gutenberg's status block). The date
          input is hidden and always carries the current state, so collapsing the
          summary line never drops the submitted value. Status has no input here:
          it is contributed by the activated Save draft / Publish button. */}
      <PanelBlock>
        <input type="hidden" name="date" value={date} />

        {/* Status — reflects which button (Save draft / Publish) will persist. */}
        <SummaryRow label={tr("admin.editor.status")}>
          <span className="font-medium">{statusLabel}</span>
        </SummaryRow>

        {/* Publish date */}
        <SummaryRow label={tr("admin.editor.publishOn")}>
          <span className="inline-flex items-center gap-2">
            <span className="font-medium">{date || "—"}</span>
            <RowEditButton
              expanded={editDate}
              onClick={() => setEditDate((o) => !o)}
              label={tr("admin.common.edit")}
            />
          </span>
        </SummaryRow>
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
      </PanelBlock>

      {/* Page attributes — parent + menu order. */}
      <PanelSection title={tr("admin.editor.pageAttributes")}>
        {pages && pages.length > 0 && (
          <Field htmlFor="page-parent" label={tr("admin.editor.parent")}>
            <SelectInput id="page-parent" name="parent" defaultValue={initial?.parent ?? ""}>
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
      </PanelSection>

      {/* Description (excerpt) — stored as the page excerpt; powers SEO meta and
          listings. Kept here so name="excerpt" still submits. */}
      <PanelSection title={tr("admin.editor.description")}>
        <label htmlFor="page-excerpt" className="sr-only">
          {tr("admin.editor.description")}
        </label>
        <Textarea
          id="page-excerpt"
          name="excerpt"
          rows={3}
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
        />
      </PanelSection>

      {/* SEO — Yoast-style snippet preview + focus-keyphrase analysis */}
      <PanelSection title={tr("admin.editor.seo")}>
        <SeoMetaBox
          title={title}
          slug={permalinkSlug}
          description={excerpt}
          baseUrl={baseUrl}
          urlPrefix="pages"
          initialSeo={initial?.seo}
          body={body}
        />
      </PanelSection>

      {/* Details — slug */}
      <PanelSection title={tr("admin.editor.details")} defaultOpen={false}>
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
      </PanelSection>
    </>
  );

  return (
    <form action={dispatch} noValidate>
      <EditorShell
        docLabel={title.trim() || tr("admin.editor.untitled")}
        statusChip={statusLabel}
        panelTitle={tr("admin.editor.pageEntry")}
        toggleLabel={tr("admin.editor.settings")}
        optionsLabel={tr("admin.editor.options")}
        actions={actions}
        options={options}
        canvas={canvas}
        panel={panel}
      />
    </form>
  );
}
