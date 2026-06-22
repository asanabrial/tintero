// SEO analysis engine — a Yoast-style focus-keyphrase analyzer.
//
// Pure, dependency-free, and fully deterministic so it can run identically on
// the server (for stored scores) and in the editor (for live feedback). Given a
// post's SEO title, meta description, slug, plain-text body, and focus
// keyphrase, it returns a list of traffic-light assessments plus an overall
// bullet score — the same mental model as Yoast SEO.

export type AssessmentScore = "good" | "ok" | "bad";

export interface Assessment {
  /** Stable id so the UI can key/group assessments. */
  id: string;
  score: AssessmentScore;
  /** Human-readable feedback line (English UI copy). */
  text: string;
}

export interface SeoInput {
  /** The SEO title (may differ from the post title). */
  seoTitle: string;
  metaDescription: string;
  /** URL slug (hyphenated). */
  slug: string;
  /** Plain-text content (markdown/HTML already stripped by the caller). */
  bodyText: string;
  /** The focus keyphrase to optimize for. */
  focusKeyphrase: string;
  /** Cornerstone content applies stricter thresholds (Yoast cornerstone mode). */
  cornerstone?: boolean;
}

// Yoast-aligned thresholds.
const META_DESC_MAX = 156; // chars; Google truncates around here
const TITLE_MAX = 60; // chars (pixel-width proxy)
const TEXT_GOOD_WORDS = 300;
const TEXT_OK_WORDS = 200;
// Cornerstone content is held to a higher word count (Yoast cornerstone mode).
const TEXT_GOOD_WORDS_CORNERSTONE = 900;
const TEXT_OK_WORDS_CORNERSTONE = 600;
const DENSITY_MIN = 0.5; // %
const DENSITY_MAX = 3.0; // %

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function wordCount(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Count non-overlapping occurrences of `needle` within `haystack` (case-insensitive). */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let idx = h.indexOf(n);
  while (idx !== -1) {
    count += 1;
    idx = h.indexOf(n, idx + n.length);
  }
  return count;
}

/**
 * Analyze a post against its focus keyphrase. With no keyphrase set, returns a
 * single "set a keyphrase" assessment (Yoast behavior) — there is nothing to
 * measure against yet.
 */
export function analyzeSeo(input: SeoInput): Assessment[] {
  const keyphrase = normalize(input.focusKeyphrase);

  if (keyphrase === "") {
    return [
      {
        id: "keyphrase",
        score: "bad",
        text: "Set a focus keyphrase to analyze this content.",
      },
    ];
  }

  const assessments: Assessment[] = [];

  // Keyphrase in SEO title.
  assessments.push(
    normalize(input.seoTitle).includes(keyphrase)
      ? { id: "keyphraseInTitle", score: "good", text: "The focus keyphrase appears in the SEO title." }
      : { id: "keyphraseInTitle", score: "bad", text: "The focus keyphrase does not appear in the SEO title." }
  );

  // Keyphrase in meta description.
  assessments.push(
    normalize(input.metaDescription).includes(keyphrase)
      ? { id: "keyphraseInMetaDescription", score: "good", text: "The focus keyphrase appears in the meta description." }
      : { id: "keyphraseInMetaDescription", score: "bad", text: "The focus keyphrase does not appear in the meta description." }
  );

  // Keyphrase in slug.
  assessments.push(
    slugify(input.slug).includes(slugify(keyphrase))
      ? { id: "keyphraseInSlug", score: "good", text: "The focus keyphrase appears in the URL slug." }
      : { id: "keyphraseInSlug", score: "bad", text: "The focus keyphrase does not appear in the URL slug." }
  );

  // Keyphrase in introduction (first ~100 words).
  const intro = input.bodyText.split(/\s+/).slice(0, 100).join(" ");
  assessments.push(
    normalize(intro).includes(keyphrase)
      ? { id: "keyphraseInIntroduction", score: "good", text: "The focus keyphrase appears in the introduction." }
      : { id: "keyphraseInIntroduction", score: "ok", text: "The focus keyphrase does not appear in the first paragraph." }
  );

  // Keyphrase density.
  const words = wordCount(input.bodyText);
  const occurrences = countOccurrences(input.bodyText, keyphrase);
  const density = words === 0 ? 0 : (occurrences / words) * 100;
  if (density === 0) {
    assessments.push({ id: "keyphraseDensity", score: "bad", text: "The focus keyphrase does not appear in the content." });
  } else if (density < DENSITY_MIN) {
    assessments.push({ id: "keyphraseDensity", score: "ok", text: `Keyphrase density is ${density.toFixed(1)}% — a little low.` });
  } else if (density > DENSITY_MAX) {
    assessments.push({ id: "keyphraseDensity", score: "ok", text: `Keyphrase density is ${density.toFixed(1)}% — that may be too high.` });
  } else {
    assessments.push({ id: "keyphraseDensity", score: "good", text: `Keyphrase density is ${density.toFixed(1)}% — within the sweet spot.` });
  }

  // Meta description length.
  const descLen = input.metaDescription.trim().length;
  if (descLen === 0) {
    assessments.push({ id: "metaDescriptionLength", score: "bad", text: "No meta description has been specified." });
  } else if (descLen > META_DESC_MAX) {
    assessments.push({ id: "metaDescriptionLength", score: "ok", text: `The meta description is ${descLen} characters — over the ${META_DESC_MAX} limit.` });
  } else {
    assessments.push({ id: "metaDescriptionLength", score: "good", text: `The meta description is ${descLen} characters — a good length.` });
  }

  // SEO title width (character proxy for pixel width).
  const titleLen = input.seoTitle.trim().length;
  if (titleLen === 0) {
    assessments.push({ id: "titleWidth", score: "bad", text: "No SEO title has been specified." });
  } else if (titleLen > TITLE_MAX) {
    assessments.push({ id: "titleWidth", score: "ok", text: `The SEO title is ${titleLen} characters — it may be truncated in results.` });
  } else {
    assessments.push({ id: "titleWidth", score: "good", text: `The SEO title is ${titleLen} characters — a good width.` });
  }

  // Text length — cornerstone content is held to a higher bar.
  const goodWords = input.cornerstone ? TEXT_GOOD_WORDS_CORNERSTONE : TEXT_GOOD_WORDS;
  const okWords = input.cornerstone ? TEXT_OK_WORDS_CORNERSTONE : TEXT_OK_WORDS;
  if (words >= goodWords) {
    assessments.push({ id: "textLength", score: "good", text: `The text is ${words} words long — good.` });
  } else if (words >= okWords) {
    assessments.push({ id: "textLength", score: "ok", text: `The text is ${words} words long — consider adding more.` });
  } else {
    assessments.push({ id: "textLength", score: "bad", text: `The text is ${words} words long — too short (aim for ${goodWords}+).` });
  }

  return assessments;
}

/**
 * Roll a list of assessments up into a single bullet score (Yoast's red/orange/
 * green dot). Worst-wins: any bad → bad; otherwise any ok → ok; all good → good.
 * An empty list scores bad (nothing has been assessed).
 */
export function overallScore(assessments: Assessment[]): AssessmentScore {
  if (assessments.length === 0) return "bad";
  if (assessments.some((a) => a.score === "bad")) return "bad";
  if (assessments.some((a) => a.score === "ok")) return "ok";
  return "good";
}
