import { describe, expect, test } from "bun:test";
import { analyzeSeo, overallScore, type SeoInput } from "@/lib/seo/analysis";

// A reasonable baseline input — a well-optimized post for the keyphrase
// "hexagonal architecture".
function baseInput(overrides: Partial<SeoInput> = {}): SeoInput {
  return {
    seoTitle: "Hexagonal architecture in practice: a complete guide",
    metaDescription:
      "Learn hexagonal architecture in practice with clear examples. This guide covers ports, adapters, and how to keep your domain isolated and testable.",
    slug: "hexagonal-architecture-in-practice",
    bodyText:
      "Hexagonal architecture is a way to structure applications. " +
      "It separates the domain from infrastructure using ports and adapters. " +
      Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ") +
      " Hexagonal architecture keeps the core testable.",
    focusKeyphrase: "hexagonal architecture",
    ...overrides,
  };
}

describe("analyzeSeo — focus keyphrase gate", () => {
  test("no focus keyphrase → single 'bad' assessment prompting to set one", () => {
    const result = analyzeSeo(baseInput({ focusKeyphrase: "" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("keyphrase");
    expect(result[0].score).toBe("bad");
  });

  test("whitespace-only keyphrase is treated as empty", () => {
    const result = analyzeSeo(baseInput({ focusKeyphrase: "   " }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("keyphrase");
  });
});

describe("analyzeSeo — individual checks", () => {
  test("keyphrase present in SEO title → good", () => {
    const a = analyzeSeo(baseInput()).find((x) => x.id === "keyphraseInTitle");
    expect(a?.score).toBe("good");
  });

  test("keyphrase missing from SEO title → bad", () => {
    const a = analyzeSeo(baseInput({ seoTitle: "A totally unrelated heading" })).find(
      (x) => x.id === "keyphraseInTitle"
    );
    expect(a?.score).toBe("bad");
  });

  test("keyphrase in meta description → good", () => {
    const a = analyzeSeo(baseInput()).find((x) => x.id === "keyphraseInMetaDescription");
    expect(a?.score).toBe("good");
  });

  test("keyphrase in slug → good", () => {
    const a = analyzeSeo(baseInput()).find((x) => x.id === "keyphraseInSlug");
    expect(a?.score).toBe("good");
  });

  test("keyphrase missing from slug → bad", () => {
    const a = analyzeSeo(baseInput({ slug: "some-other-url" })).find(
      (x) => x.id === "keyphraseInSlug"
    );
    expect(a?.score).toBe("bad");
  });

  test("empty meta description → bad length assessment", () => {
    const a = analyzeSeo(baseInput({ metaDescription: "" })).find(
      (x) => x.id === "metaDescriptionLength"
    );
    expect(a?.score).toBe("bad");
  });

  test("over-long meta description (>156 chars) → ok (not good)", () => {
    const longDesc = "hexagonal architecture ".repeat(20); // ~460 chars
    const a = analyzeSeo(baseInput({ metaDescription: longDesc })).find(
      (x) => x.id === "metaDescriptionLength"
    );
    expect(a?.score).toBe("ok");
  });

  test("short text (<300 words) → bad text length", () => {
    const a = analyzeSeo(
      baseInput({ bodyText: "hexagonal architecture is short" })
    ).find((x) => x.id === "textLength");
    expect(a?.score).toBe("bad");
  });
});

describe("analyzeSeo — cornerstone content (stricter thresholds)", () => {
  // ~400 words: comfortably good for a normal article, too short for cornerstone.
  function fourHundredWordBody(): string {
    return (
      "hexagonal architecture " +
      Array.from({ length: 398 }, (_, i) => `word${i}`).join(" ")
    );
  }

  test("text length is good for a normal post but not for cornerstone", () => {
    const normal = analyzeSeo(baseInput({ bodyText: fourHundredWordBody() })).find(
      (x) => x.id === "textLength"
    );
    expect(normal?.score).toBe("good");

    const cornerstone = analyzeSeo(
      baseInput({ bodyText: fourHundredWordBody(), cornerstone: true })
    ).find((x) => x.id === "textLength");
    expect(cornerstone?.score === "ok" || cornerstone?.score === "bad").toBe(true);
  });
});

describe("overallScore", () => {
  test("all good → good", () => {
    expect(
      overallScore([
        { id: "a", score: "good", text: "" },
        { id: "b", score: "good", text: "" },
      ])
    ).toBe("good");
  });

  test("any bad drags the bullet to bad", () => {
    expect(
      overallScore([
        { id: "a", score: "good", text: "" },
        { id: "b", score: "bad", text: "" },
      ])
    ).toBe("bad");
  });

  test("ok present but no bad → ok", () => {
    expect(
      overallScore([
        { id: "a", score: "good", text: "" },
        { id: "b", score: "ok", text: "" },
      ])
    ).toBe("ok");
  });

  test("empty list → bad (nothing assessed)", () => {
    expect(overallScore([])).toBe("bad");
  });
});
