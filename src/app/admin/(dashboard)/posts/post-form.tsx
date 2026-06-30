"use client";

import { useState, useActionState } from "react";
import type { PostFormState } from "./actions";
import { MediaPickerModal } from "calamo";
import { renderEditorHtmlAction } from "../_components/editor-html-actions";
import { listMediaAction } from "../media/actions";
import {
  Field,
  TextInput,
  Textarea,
  SelectInput,
  CheckboxField,
  FormAlert,
  cn,
} from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { EditorShell } from "../_components/editor-shell";
import { PanelSection, PanelBlock, SummaryRow, RowEditButton } from "../_components/editor-panel";
import { RichEditor } from "../_components/rich-editor";
import { CategoryChecklist, TagTokenInput, type TaxonomyOption } from "./editor-controls";
import { SeoMetaBox } from "../_components/seo-meta-box";
import { useT } from "@/lib/i18n/provider";

export interface PostFormInitial {
  title?: string;
  slug?: string;
  date?: string;
  status?: "published" | "draft";
  excerpt?: string;
  coverImage?: string;
  author?: string;
  tags?: string;
  categories?: string;
  comments?: boolean;
  sticky?: boolean;
  visibility?: "public" | "private" | "password";
  postPassword?: string;
  body?: string;
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

interface PostFormProps {
  /** Bound server action — createPostAction or updatePostAction. */
  action: (prevState: PostFormState, formData: FormData) => Promise<PostFormState>;
  /** Initial field values for edit prefill. */
  initial?: PostFormInitial;
  /** Hidden identity field for edit — the current slug being edited. */
  currentSlug?: string;
  /** All existing categories — powers the WP-style category checklist. */
  categories?: TaxonomyOption[];
  /** All existing tags — powers the tag token autocomplete + "Most used" row. */
  tags?: TaxonomyOption[];
  /** Registered users — powers the author autocomplete. */
  authors?: { name: string | null; email: string }[];
  /** Site base URL — used to render the permalink preview under the title. */
  baseUrl?: string;
  /** When set (edit screen), shows a Revisions link in the options (⋮) menu. */
  revisionsHref?: string;
}

function parseCsv(s?: string): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Lightweight slug preview — mirrors the server's "blank slug → from title". */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * PostForm — client island for create/edit post forms.
 *
 * Presentational only: owns form UX (pending state, field/global errors).
 * No data fetching, no auth, no FS imports. The variant is controlled by the
 * `action` prop (composition pattern — not a boolean isEdit flag).
 *
 * The chrome is the WordPress (Gutenberg)-style `EditorShell`: a full-bleed
 * canvas (title + rich body) and a flat settings panel. EditorShell, its action
 * buttons, and every panel input all render INSIDE this single `<form>`, so the
 * submitted FormData is identical to the old two-column layout — every input
 * `name` is preserved and `status` is still set by the activated submit button.
 */
export function PostForm({
  action,
  initial,
  currentSlug,
  categories,
  tags,
  authors,
  baseUrl,
  revisionsHref,
}: PostFormProps) {
  const tr = useT();
  const [state, dispatch] = useActionState<PostFormState, FormData>(action, undefined);
  const [coverImage, setCoverImage] = useState(initial?.coverImage ?? "");
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private" | "password">(
    initial?.visibility ?? "public"
  );
  const [postPassword, setPostPassword] = useState(initial?.postPassword ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  // WordPress summary lines: Visibility/Date collapse to a label→value row with
  // an inline "Edit" toggle. The named inputs are hidden and always submit the
  // current state, so collapsing never drops a value.
  const [editVisibility, setEditVisibility] = useState(false);
  const [editDate, setEditDate] = useState(false);
  // Title + slug are controlled so the doc label, permalink preview, and SEO box
  // stay live.
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  // Description (excerpt) is controlled so the SEO box can analyze it live.
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  // Body markdown mirrored from RichEditor — the hidden <input> fires no input
  // event on programmatic value changes, so we lift it here to feed the SEO box.
  const [body, setBody] = useState(initial?.body ?? "");

  const VISIBILITY_LABELS: Record<typeof visibility, string> = {
    public: tr("admin.editor.visPublic"),
    private: tr("admin.editor.visPrivate"),
    password: tr("admin.editor.visPassword"),
  };

  const status = initial?.status ?? "draft";
  const isPublished = status === "published";
  const statusLabel = isPublished
    ? tr("admin.editor.statusPublished")
    : tr("admin.editor.statusDraft");
  const permalinkSlug = slug.trim() || slugify(title) || "post-slug";
  const permalink = `${(baseUrl ?? "").replace(/\/$/, "")}/blog/${permalinkSlug}`;

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

  // Overflow "⋮" menu — Preview + Move to Trash. Both need a saved post, so the
  // whole menu is omitted for a brand-new (unsaved) post.
  const menuRowClass =
    "flex w-full items-center px-3 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800";
  const options = currentSlug ? (
    <>
      <a
        href={`/admin/posts/${currentSlug}/preview`}
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        className={menuRowClass}
      >
        {tr("admin.editor.preview")}
      </a>
      {revisionsHref ? (
        <a href={revisionsHref} role="menuitem" className={menuRowClass}>
          {tr("admin.revisions.title")}
        </a>
      ) : null}
      <a
        href={`/admin/posts/${currentSlug}/delete`}
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
        id="post-body"
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
      {/* Summary — Visibility + Publish date (Gutenberg's status/visibility block).
          Named inputs are hidden and always carry the current state, so collapsing
          a summary line never drops the submitted value. */}
      <PanelBlock>
        <input type="hidden" name="visibility" value={visibility} />
        {visibility === "password" && (
          <input type="hidden" name="postPassword" value={postPassword} />
        )}
        <input type="hidden" name="date" value={date} />

        {/* Visibility */}
        <SummaryRow label={tr("admin.editor.visibility")}>
          <span className="inline-flex items-center gap-2">
            <span className="font-medium">{VISIBILITY_LABELS[visibility]}</span>
            <RowEditButton
              expanded={editVisibility}
              onClick={() => setEditVisibility((o) => !o)}
              label={tr("admin.common.edit")}
            />
          </span>
        </SummaryRow>
        {editVisibility && (
          <div className="space-y-2 rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
            <label htmlFor="post-visibility" className="sr-only">
              {tr("admin.editor.visibility")}
            </label>
            <SelectInput
              id="post-visibility"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as "public" | "private" | "password")
              }
            >
              <option value="public">{tr("admin.editor.visPublic")}</option>
              <option value="private">{tr("admin.editor.visPrivate")}</option>
              <option value="password">{tr("admin.editor.visPassword")}</option>
            </SelectInput>
            {visibility === "password" && (
              <TextInput
                id="post-post-password"
                type="text"
                value={postPassword}
                onChange={(e) => setPostPassword(e.target.value)}
                required
                placeholder={tr("admin.editor.postPassword")}
                aria-label={tr("admin.editor.postPassword")}
              />
            )}
          </div>
        )}

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
            <label htmlFor="post-date" className="sr-only">
              {tr("admin.editor.publishDate")}
            </label>
            <TextInput
              id="post-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        )}
      </PanelBlock>

      {/* Featured image */}
      <PanelBlock>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {tr("admin.editor.featuredImage")}
        </p>
        <div className="space-y-1.5">
          <label htmlFor="post-cover-image" className="sr-only">
            {tr("admin.editor.featuredImage")}
          </label>
          <div className="flex items-center gap-2">
            <TextInput
              id="post-cover-image"
              type="text"
              name="coverImage"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="/uploads/... or https://… (blank = none)"
            />
            <button
              type="button"
              onClick={() => setCoverPickerOpen(true)}
              className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {tr("admin.editor.chooseFromMedia")}
            </button>
          </div>
          {coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImage}
              alt="Featured image preview"
              className="mt-1 h-20 w-auto rounded object-contain"
            />
          ) : null}
        </div>
        <MediaPickerModal
          open={coverPickerOpen}
          listMedia={listMediaAction}
          onClose={() => setCoverPickerOpen(false)}
          onSelect={(asset) => {
            setCoverImage(asset.url);
            setCoverPickerOpen(false);
          }}
        />
      </PanelBlock>

      {/* Categories */}
      <PanelSection title={tr("admin.editor.categories")}>
        <CategoryChecklist
          name="categories"
          options={categories ?? []}
          initialSelected={parseCsv(initial?.categories)}
        />
      </PanelSection>

      {/* Tags */}
      <PanelSection title={tr("admin.editor.tags")}>
        <TagTokenInput
          name="tags"
          options={tags ?? []}
          initialTokens={parseCsv(initial?.tags)}
        />
      </PanelSection>

      {/* Discussion */}
      <PanelSection title={tr("admin.editor.discussion")}>
        <CheckboxField
          id="post-comments"
          name="comments"
          label={tr("admin.editor.enableComments")}
          defaultChecked={initial?.comments ?? true}
          value="on"
        />
        <CheckboxField
          id="post-sticky"
          name="sticky"
          label={tr("admin.editor.stickPost")}
          defaultChecked={initial?.sticky ?? false}
          value="on"
        />
      </PanelSection>

      {/* Description (excerpt) — stored as the post excerpt; powers SEO meta,
          listings, and RSS. Kept here so name="excerpt" still submits. */}
      <PanelSection title={tr("admin.editor.description")} defaultOpen={false}>
        <label htmlFor="post-excerpt" className="sr-only">
          {tr("admin.editor.description")}
        </label>
        <Textarea
          id="post-excerpt"
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
          initialSeo={initial?.seo}
          body={body}
        />
      </PanelSection>

      {/* Details — slug + author */}
      <PanelSection title={tr("admin.editor.details")} defaultOpen={false}>
        <Field htmlFor="post-slug" label={tr("admin.editor.slug")}>
          <TextInput
            id="post-slug"
            type="text"
            name="slug"
            placeholder={tr("admin.editor.slugPlaceholder")}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </Field>

        <Field htmlFor="post-author" label={tr("admin.editor.author")}>
          <TextInput
            id="post-author"
            name="author"
            type="text"
            list="post-author-list"
            defaultValue={initial?.author ?? ""}
            placeholder={tr("admin.editor.authorHint")}
          />
          {authors && authors.length > 0 ? (
            <datalist id="post-author-list">
              {authors.map((a) => (
                <option key={a.email} value={a.name ?? a.email} />
              ))}
            </datalist>
          ) : null}
        </Field>
      </PanelSection>
    </>
  );

  return (
    <form action={dispatch} noValidate>
      <EditorShell
        docLabel={title.trim() || tr("admin.editor.untitled")}
        statusChip={statusLabel}
        panelTitle={tr("admin.editor.entry")}
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
