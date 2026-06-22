"use client";

import { useState, useActionState } from "react";
import type { PostFormState } from "./actions";
import { Calamo, MediaPickerModal } from "calamo";
import { renderPreviewAction } from "../_components/editor-actions";
import { listMediaAction } from "../media/actions";
import {
  Field,
  TextInput,
  Textarea,
  SelectInput,
  CheckboxField,
  FormAlert,
  MetaBox,
  EditorLayout,
} from "@/app/components/ui/form";
import { SubmitButton } from "@/app/components/ui/submit-button";
import { CollapsibleMetaBox } from "@/app/components/ui/collapsible-meta-box";
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
 * Presentational only: owns form UX (pending state, field/global errors).
 * No data fetching, no auth, no FS imports.
 * Variant is controlled by the `action` prop (composition pattern — not a boolean isEdit flag).
 */
export function PostForm({
  action,
  initial,
  currentSlug,
  categories,
  tags,
  authors,
  baseUrl,
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
  // WordPress "Publish" box — Visibility/Date collapse to summary lines with an
  // inline "Edit" toggle. The named inputs are hidden and always submit the
  // current state, so collapsing never drops a value.
  const [editVisibility, setEditVisibility] = useState(false);
  const [editDate, setEditDate] = useState(false);
  // Title + slug are controlled so the permalink preview stays live.
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  // Description (excerpt) is controlled so the SEO box can analyze it live.
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");

  const VISIBILITY_LABELS: Record<typeof visibility, string> = {
    public: tr("admin.editor.visPublic"),
    private: tr("admin.editor.visPrivate"),
    password: tr("admin.editor.visPassword"),
  };

  const isPublished = initial?.status === "published";
  const permalinkSlug = slug.trim() || slugify(title) || "post-slug";
  const permalink = `${(baseUrl ?? "").replace(/\/$/, "")}/blog/${permalinkSlug}`;

  return (
    <form action={dispatch} noValidate className="space-y-4">
      {/* Hidden: current slug for edit identity */}
      {currentSlug && <input type="hidden" name="currentSlug" value={currentSlug} />}

      {/* Global error banner */}
      {state?.error && <FormAlert>{state.error}</FormAlert>}

      <EditorLayout
        main={
          <>
            {/* Title */}
            <Field htmlFor="post-title" label={tr("admin.editor.title")} required>
              <TextInput
                id="post-title"
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
            <Field htmlFor="post-body" label={tr("admin.editor.body")} required>
              <Calamo
                name="body"
                id="post-body"
                defaultValue={initial?.body ?? ""}
                renderPreview={renderPreviewAction}
                listMedia={listMediaAction}
              />
            </Field>

            {/* Description (stored as the post excerpt; powers SEO meta, listings, RSS). */}
            <Field htmlFor="post-excerpt" label={tr("admin.editor.description")}>
              <Textarea
                id="post-excerpt"
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
              <input type="hidden" name="visibility" value={visibility} />
              {visibility === "password" && (
                <input type="hidden" name="postPassword" value={postPassword} />
              )}
              <input type="hidden" name="date" value={date} />

              {/* Visibility — WordPress summary line + inline Edit toggle. */}
              <div className="flex items-start justify-between gap-2 text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">
                  {tr("admin.editor.visibility")}:{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {VISIBILITY_LABELS[visibility]}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditVisibility((o) => !o)}
                  aria-expanded={editVisibility}
                  className="text-[#2271b1] hover:underline dark:text-[#4f94d4]"
                >
                  {tr("admin.common.edit")}
                </button>
              </div>
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

              {/* Save Draft / Publish split — the activated button contributes
                  `status` to FormData (no separate select). The accent button is
                  first in the DOM so Enter triggers the primary action; CSS order
                  places it visually on the right. */}
              <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
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
                <div className="flex items-center justify-between">
                  {currentSlug ? (
                    <a
                      href={`/admin/posts/${currentSlug}/preview`}
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
                      href={`/admin/posts/${currentSlug}/delete`}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      {tr("admin.editor.moveToTrash")}
                    </a>
                  ) : null}
                </div>
              </div>
            </MetaBox>

            {/* Featured image */}
            <CollapsibleMetaBox title={tr("admin.editor.featuredImage")}>
              <div className="space-y-1.5">
                <label htmlFor="post-cover-image" className="sr-only">
                  Featured image URL
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
            </CollapsibleMetaBox>

            {/* Categories — WP-style checklist (+ add new) */}
            <CollapsibleMetaBox title={tr("admin.editor.categories")}>
              <CategoryChecklist
                name="categories"
                options={categories ?? []}
                initialSelected={parseCsv(initial?.categories)}
              />
            </CollapsibleMetaBox>

            {/* Tags — token input with autocomplete + most-used */}
            <CollapsibleMetaBox title={tr("admin.editor.tags")}>
              <TagTokenInput
                name="tags"
                options={tags ?? []}
                initialTokens={parseCsv(initial?.tags)}
              />
            </CollapsibleMetaBox>

            {/* Discussion */}
            <CollapsibleMetaBox title={tr("admin.editor.discussion")}>
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
            </CollapsibleMetaBox>

            {/* SEO — Yoast-style snippet preview + focus-keyphrase analysis */}
            <CollapsibleMetaBox title={tr("admin.editor.seo")}>
              <SeoMetaBox
                title={title}
                slug={permalinkSlug}
                description={excerpt}
                baseUrl={baseUrl}
                initialSeo={initial?.seo}
              />
            </CollapsibleMetaBox>

            {/* Details */}
            <CollapsibleMetaBox title={tr("admin.editor.details")} defaultOpen={false}>
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
            </CollapsibleMetaBox>
          </>
        }
      />
    </form>
  );
}
