"use client";

import { useMemo, useState } from "react";
import {
  analyzeSeo,
  overallScore,
  extractContentFeaturesFromMarkdown,
  type AssessmentScore,
} from "@/lib/seo/analysis";
import { analyzeReadability } from "@/lib/seo/readability";
import { useT } from "@/lib/i18n/provider";

/**
 * Yoast-style SEO meta box for the post editor — a Google snippet preview, a
 * focus-keyphrase input, and live traffic-light analysis.
 *
 * This first slice analyzes the editor's live fields (title, slug, description)
 * and reads the body textarea on demand; the focus keyphrase is local state
 * (persisting it to frontmatter is a later slice). It is purely additive — it
 * never owns or submits the post's data.
 */

const DOT: Record<AssessmentScore, string> = {
  good: "bg-green-500",
  ok: "bg-amber-500",
  bad: "bg-red-500",
};

/** Light markdown → text strip so word counts and keyphrase checks see prose. */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

const FIELD_CLASS =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function SeoMetaBox({
  title,
  slug,
  description,
  baseUrl,
  urlPrefix = "blog",
  initialSeo,
}: {
  /** Live post title — the fallback when no SEO title override is set. */
  title: string;
  /** Live URL slug. */
  slug: string;
  /** Live description (excerpt) — the fallback when no meta description override is set. */
  description: string;
  /** Site base URL for the snippet preview breadcrumb. */
  baseUrl?: string;
  /** URL path segment for the preview ("blog" for posts, "pages" for pages). */
  urlPrefix?: string;
  /** Persisted SEO overrides to prefill the fields (edit mode). */
  initialSeo?: {
    title?: string;
    metaDescription?: string;
    focusKeyphrase?: string;
    canonical?: string;
    noindex?: boolean;
    ogImage?: string;
    cornerstone?: boolean;
  };
}) {
  const tr = useT();
  const bulletLabel: Record<AssessmentScore, string> = {
    good: tr("admin.seo.good"),
    ok: tr("admin.seo.ok"),
    bad: tr("admin.seo.needsWork"),
  };
  // These are real form fields (name=...) so they submit with the post; the
  // server action reads them into the `seo` frontmatter object.
  const [seoTitle, setSeoTitle] = useState(initialSeo?.title ?? "");
  const [metaDescription, setMetaDescription] = useState(initialSeo?.metaDescription ?? "");
  const [keyphrase, setKeyphrase] = useState(initialSeo?.focusKeyphrase ?? "");
  const [canonical, setCanonical] = useState(initialSeo?.canonical ?? "");
  const [ogImage, setOgImage] = useState(initialSeo?.ogImage ?? "");
  const [cornerstone, setCornerstone] = useState(initialSeo?.cornerstone ?? false);
  const [noindex, setNoindex] = useState(initialSeo?.noindex ?? false);

  // Effective values: override when set, else the post's title/description.
  const effectiveTitle = seoTitle.trim() || title.trim();
  const effectiveDesc = metaDescription.trim() || description.trim();

  const previewSlug = slug.trim() || "post-slug";
  const cleanBase = (baseUrl ?? "https://example.com").replace(/\/$/, "");
  const previewUrl = `${cleanBase}/${urlPrefix}/${previewSlug}`;
  const previewTitle = effectiveTitle || "Your post title";
  const previewDesc =
    effectiveDesc ||
    "Add a description to control how this post appears in search results.";

  // Recompute when any tracked field changes; the body is read live at that
  // moment (body-only edits refresh once another field or the keyphrase moves).
  const { assessments, readability } = useMemo(() => {
    const bodyEl =
      typeof document !== "undefined"
        ? (document.querySelector('textarea[name="body"]') as HTMLTextAreaElement | null)
        : null;
    const rawBody = bodyEl?.value ?? "";
    const bodyText = stripMarkdown(rawBody);
    return {
      assessments: analyzeSeo({
        seoTitle: effectiveTitle,
        metaDescription: effectiveDesc,
        slug,
        bodyText,
        focusKeyphrase: keyphrase,
        cornerstone,
        content: extractContentFeaturesFromMarkdown(rawBody),
      }),
      readability: analyzeReadability(bodyText),
    };
  }, [effectiveTitle, effectiveDesc, slug, keyphrase, cornerstone]);

  const bullet = overallScore(assessments);
  const readabilityBullet = overallScore(readability);

  return (
    <div className="space-y-4">
      {/* Google snippet preview */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {tr("admin.seo.searchAppearance")}
        </p>
        <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">{previewUrl}</p>
          <p className="truncate text-base text-[#1a0dab] dark:text-[#8ab4f8]">
            {truncate(previewTitle, 60)}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">
            {truncate(previewDesc, 156)}
          </p>
        </div>
      </div>

      {/* Focus keyphrase */}
      <div className="space-y-1.5">
        <label
          htmlFor="seo-focus-keyphrase"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {tr("admin.seo.focusKeyphrase")}
        </label>
        <input
          id="seo-focus-keyphrase"
          name="focusKeyphrase"
          type="text"
          value={keyphrase}
          onChange={(e) => setKeyphrase(e.target.value)}
          placeholder={tr("admin.seo.defaultsFocusKeyphrase")}
          className={FIELD_CLASS}
        />
      </div>

      {/* SEO title override */}
      <div className="space-y-1.5">
        <label
          htmlFor="seo-title"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {tr("admin.seo.seoTitle")}
        </label>
        <input
          id="seo-title"
          name="seoTitle"
          type="text"
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          placeholder={title.trim() || tr("admin.seo.defaultsSeoTitle")}
          className={FIELD_CLASS}
        />
      </div>

      {/* Meta description override */}
      <div className="space-y-1.5">
        <label
          htmlFor="seo-meta-description"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          {tr("admin.seo.metaDescription")}
        </label>
        <textarea
          id="seo-meta-description"
          name="metaDescription"
          rows={3}
          value={metaDescription}
          onChange={(e) => setMetaDescription(e.target.value)}
          placeholder={description.trim() || tr("admin.seo.defaultsMetaDesc")}
          className={FIELD_CLASS}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {effectiveDesc.length} / 156 characters
        </p>
      </div>

      {/* Advanced — canonical + robots noindex */}
      <details className="rounded-md border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {tr("admin.seo.advanced")}
        </summary>
        <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
          <div className="space-y-1.5">
            <label
              htmlFor="seo-canonical"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {tr("admin.seo.canonicalUrl")}
            </label>
            <input
              id="seo-canonical"
              name="canonical"
              type="text"
              value={canonical}
              onChange={(e) => setCanonical(e.target.value)}
              placeholder={tr("admin.seo.defaultsCanonical")}
              className={FIELD_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="seo-og-image"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {tr("admin.seo.socialImage")}
            </label>
            <input
              id="seo-og-image"
              name="ogImage"
              type="text"
              value={ogImage}
              onChange={(e) => setOgImage(e.target.value)}
              placeholder={tr("admin.seo.defaultsSocialImage")}
              className={FIELD_CLASS}
            />
            {ogImage.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ogImage}
                alt="Social share preview"
                className="mt-1 h-20 w-auto rounded object-contain"
              />
            ) : null}
          </div>
          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="noindex"
              checked={noindex}
              onChange={(e) => setNoindex(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              {tr("admin.seo.noindex")}
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Emits <code>noindex, nofollow</code>.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="cornerstone"
              checked={cornerstone}
              onChange={(e) => setCornerstone(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              {tr("admin.seo.cornerstone")}
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Holds this content to stricter SEO analysis (longer minimum length).
              </span>
            </span>
          </label>
        </div>
      </details>

      {/* Overall bullet */}
      <div className="flex items-center gap-2">
        <span className={`inline-block h-3 w-3 rounded-full ${DOT[bullet]}`} aria-hidden="true" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {bulletLabel[bullet]}
        </span>
      </div>

      {/* SEO assessment list */}
      <ul className="space-y-1.5">
        {assessments.map((a) => (
          <li key={a.id} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span
              className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${DOT[a.score]}`}
              aria-hidden="true"
            />
            <span>{a.text}</span>
          </li>
        ))}
      </ul>

      {/* Readability (Yoast's second tab) */}
      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div className="mb-2 flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${DOT[readabilityBullet]}`} aria-hidden="true" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {tr("admin.seo.readability", { score: bulletLabel[readabilityBullet] })}
          </span>
        </div>
        <ul className="space-y-1.5">
          {readability.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span
                className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${DOT[a.score]}`}
                aria-hidden="true"
              />
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
