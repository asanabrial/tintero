// Computes a single overall SEO bullet for a post — used by the admin list's
// "SEO" column (Yoast shows the same red/orange/green dot per row).

import { analyzeSeo, overallScore, extractContentFeaturesFromHtml, type AssessmentScore } from "./analysis";
import { analyzeReadability } from "./readability";
import type { Post } from "@/lib/content/types";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The overall SEO score for a post, or null when no focus keyphrase is set
 * (Yoast shows "not analyzed" / grey in that case rather than a red bullet).
 */
export function postSeoScore(post: Post): AssessmentScore | null {
  const keyphrase = post.seo?.focusKeyphrase?.trim();
  if (!keyphrase) return null;
  return overallScore(
    analyzeSeo({
      seoTitle: post.seo?.title?.trim() || post.title,
      metaDescription: post.seo?.metaDescription?.trim() || post.excerpt,
      slug: post.slug,
      bodyText: stripHtml(post.html),
      focusKeyphrase: keyphrase,
      cornerstone: post.seo?.cornerstone,
      content: extractContentFeaturesFromHtml(post.html),
    })
  );
}

/**
 * The overall readability score for a post (Yoast's second list column). Unlike
 * SEO, readability needs no keyphrase, so it always returns a bullet.
 */
export function postReadabilityScore(post: Post): AssessmentScore {
  return overallScore(analyzeReadability(stripHtml(post.html)));
}
