// Readability analysis — the Yoast "Readability" tab as a pure, deterministic
// engine. Operates on plain text (markdown already stripped) and returns the
// same traffic-light Assessment shape as the SEO analyzer, so both feed one UI.

import type { Assessment } from "./analysis";

// Yoast-aligned thresholds.
const FLESCH_GOOD = 60; // "fairly easy" and above
const FLESCH_OK = 30; // "difficult"; below this is "very confusing"
const LONG_SENTENCE_WORDS = 20;
const LONG_SENTENCE_PCT_GOOD = 25; // % of sentences over the word limit
const LONG_SENTENCE_PCT_OK = 30;
const PARAGRAPH_OK_WORDS = 150;
const PARAGRAPH_BAD_WORDS = 200;

function words(text: string): string[] {
  const t = text.trim();
  return t === "" ? [] : t.split(/\s+/);
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Approximate English syllable count (vowel groups, minus a silent trailing e). */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;
  if (w.endsWith("e") && count > 1) count -= 1;
  return Math.max(1, count);
}

/**
 * Flesch Reading Ease: 206.835 − 1.015·(words/sentences) − 84.6·(syllables/words).
 * Higher is easier (100 ≈ very easy, 0 ≈ very confusing). Empty text scores 0.
 */
export function fleschReadingEase(text: string): number {
  const ws = words(text);
  const ss = sentences(text);
  if (ws.length === 0 || ss.length === 0) return 0;
  const syllables = ws.reduce((sum, w) => sum + countSyllables(w), 0);
  return 206.835 - 1.015 * (ws.length / ss.length) - 84.6 * (syllables / ws.length);
}

/**
 * Analyze prose readability. With no content, returns a single "add content"
 * assessment. Otherwise checks reading ease, long-sentence ratio, and the
 * longest paragraph.
 */
export function analyzeReadability(text: string): Assessment[] {
  const ws = words(text);
  if (ws.length === 0) {
    return [{ id: "readability", score: "bad", text: "Add content to analyze readability." }];
  }

  const assessments: Assessment[] = [];

  // Flesch Reading Ease.
  const flesch = fleschReadingEase(text);
  const fleschRounded = Math.round(flesch);
  if (flesch >= FLESCH_GOOD) {
    assessments.push({ id: "fleschReadingEase", score: "good", text: `Reading ease is ${fleschRounded} — easy to read.` });
  } else if (flesch >= FLESCH_OK) {
    assessments.push({ id: "fleschReadingEase", score: "ok", text: `Reading ease is ${fleschRounded} — fairly difficult; consider simplifying.` });
  } else {
    assessments.push({ id: "fleschReadingEase", score: "bad", text: `Reading ease is ${fleschRounded} — very difficult to read.` });
  }

  // Sentence length: share of sentences over the word limit.
  const ss = sentences(text);
  const longSentences = ss.filter((s) => words(s).length > LONG_SENTENCE_WORDS).length;
  const longPct = ss.length === 0 ? 0 : (longSentences / ss.length) * 100;
  if (longPct <= LONG_SENTENCE_PCT_GOOD) {
    assessments.push({ id: "sentenceLength", score: "good", text: `${Math.round(longPct)}% of sentences are long — within range.` });
  } else if (longPct <= LONG_SENTENCE_PCT_OK) {
    assessments.push({ id: "sentenceLength", score: "ok", text: `${Math.round(longPct)}% of sentences are long — try shortening some.` });
  } else {
    assessments.push({ id: "sentenceLength", score: "bad", text: `${Math.round(longPct)}% of sentences are over ${LONG_SENTENCE_WORDS} words — too many long sentences.` });
  }

  // Consecutive sentences starting with the same word (Yoast flags 3+ in a row,
  // a sign of monotonous sentence openings). Language-agnostic.
  const firstWords = ss
    .map((s) => (words(s)[0] ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0);
  let maxRun = firstWords.length > 0 ? 1 : 0;
  let run = maxRun;
  for (let i = 1; i < firstWords.length; i++) {
    run = firstWords[i] === firstWords[i - 1] ? run + 1 : 1;
    if (run > maxRun) maxRun = run;
  }
  if (maxRun >= 3) {
    assessments.push({ id: "consecutiveSentences", score: "ok", text: `${maxRun} consecutive sentences start with the same word — vary your sentence openings.` });
  } else {
    assessments.push({ id: "consecutiveSentences", score: "good", text: "Sentence openings are varied." });
  }

  // Paragraph length: the longest paragraph.
  const maxParaWords = paragraphs(text).reduce((max, p) => Math.max(max, words(p).length), 0);
  if (maxParaWords > PARAGRAPH_BAD_WORDS) {
    assessments.push({ id: "paragraphLength", score: "bad", text: `Your longest paragraph is ${maxParaWords} words — split it up.` });
  } else if (maxParaWords > PARAGRAPH_OK_WORDS) {
    assessments.push({ id: "paragraphLength", score: "ok", text: `Your longest paragraph is ${maxParaWords} words — consider splitting it.` });
  } else {
    assessments.push({ id: "paragraphLength", score: "good", text: "Paragraph lengths are good." });
  }

  return assessments;
}
