import { describe, expect, test } from "bun:test";
import { deriveSlug } from "../../src/lib/content/slug";

describe("deriveSlug", () => {
  test("plain filename without extension becomes the slug", () => {
    expect(deriveSlug("hello-world.md")).toBe("hello-world");
  });

  test("date prefix YYYY-MM-DD- is stripped from filename", () => {
    expect(deriveSlug("2024-01-15-my-post.md")).toBe("my-post");
  });

  test("folder-based post: folder name wins over index", () => {
    // When a post lives at content/posts/my-post/index.md, the folder name is passed
    expect(deriveSlug("my-post/index.md")).toBe("my-post");
  });

  test("explicit frontmatter slug overrides filename derivation", () => {
    expect(deriveSlug("2024-01-15-my-post.md", "custom-slug")).toBe(
      "custom-slug"
    );
  });
});
