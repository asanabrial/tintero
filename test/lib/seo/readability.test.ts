import { describe, expect, test } from "bun:test";
import {
  analyzeReadability,
  countSyllables,
  fleschReadingEase,
} from "@/lib/seo/readability";

describe("countSyllables", () => {
  test("simple one-syllable words", () => {
    expect(countSyllables("cat")).toBe(1);
    expect(countSyllables("the")).toBe(1);
  });

  test("multi-syllable words", () => {
    expect(countSyllables("hello")).toBe(2);
    expect(countSyllables("banana")).toBe(3);
  });

  test("never returns less than 1 for a word with letters", () => {
    expect(countSyllables("rhythm")).toBeGreaterThanOrEqual(1);
  });
});

describe("fleschReadingEase", () => {
  test("very simple prose scores high (easy)", () => {
    const score = fleschReadingEase("The cat sat on the mat. The dog ran fast.");
    expect(score).toBeGreaterThan(80);
  });

  test("dense, long-word prose scores lower than simple prose", () => {
    const simple = fleschReadingEase("I see the sun. It is hot. We run now.");
    const complex = fleschReadingEase(
      "Comprehensive architectural decomposition necessitates meticulous consideration of interdependent infrastructural abstractions."
    );
    expect(complex).toBeLessThan(simple);
  });

  test("empty text scores 0 (nothing to assess)", () => {
    expect(fleschReadingEase("")).toBe(0);
  });
});

describe("analyzeReadability", () => {
  test("simple prose → good Flesch assessment", () => {
    const a = analyzeReadability("The cat sat on the mat. The dog ran fast.").find(
      (x) => x.id === "fleschReadingEase"
    );
    expect(a?.score).toBe("good");
  });

  test("mostly long sentences → bad sentence-length assessment", () => {
    const longSentence =
      "This sentence has been deliberately written to contain far more than twenty separate words so that it clearly counts as a long and hard to read sentence. ";
    const a = analyzeReadability(longSentence.repeat(4)).find(
      (x) => x.id === "sentenceLength"
    );
    expect(a?.score).toBe("bad");
  });

  test("a very long paragraph → flagged paragraph length", () => {
    const para = Array.from({ length: 220 }, (_, i) => `word${i}`).join(" ") + ".";
    const a = analyzeReadability(para).find((x) => x.id === "paragraphLength");
    expect(a?.score === "bad" || a?.score === "ok").toBe(true);
  });

  test("empty text → single 'bad' prompt", () => {
    const result = analyzeReadability("");
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe("bad");
  });
});
