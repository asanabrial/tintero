import { describe, expect, test } from "bun:test";
import { postReadabilityScore, postSeoScore } from "@/lib/seo/post-score";
import type { Post } from "@/lib/content/types";

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    slug: "hexagonal-architecture",
    title: "Hexagonal architecture in practice",
    date: "2025-01-01",
    status: "published",
    tags: [],
    categories: ["tech"],
    excerpt: "Learn hexagonal architecture in practice with clear examples.",
    html: "<p>Hexagonal architecture separates the domain from infrastructure.</p>",
    comments: true,
    sticky: false,
    author: "Author",
    visibility: "public",
    ...overrides,
  };
}

describe("postSeoScore", () => {
  test("returns null when no focus keyphrase is set", () => {
    expect(postSeoScore(makePost())).toBeNull();
    expect(postSeoScore(makePost({ seo: {} }))).toBeNull();
  });

  test("returns a traffic-light score when a focus keyphrase is set", () => {
    const score = postSeoScore(
      makePost({ seo: { focusKeyphrase: "hexagonal architecture" } })
    );
    expect(score).not.toBeNull();
    expect(["good", "ok", "bad"]).toContain(score as string);
  });
});

describe("postReadabilityScore", () => {
  test("always returns a traffic-light score (no keyphrase needed)", () => {
    const score = postReadabilityScore(
      makePost({ html: "<p>The cat sat on the mat. The dog ran fast.</p>" })
    );
    expect(["good", "ok", "bad"]).toContain(score);
  });
});
