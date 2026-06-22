import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { FilesystemContentAdapter } from "./fs-adapter";

const MINIMAL_SITE_YAML = `title: Test Site
description: Test
baseUrl: http://localhost:3000
language: en
author:
  name: Test Author
  email: test@example.com
`;

const MINIMAL_FRONTMATTER = (slug: string) =>
  `---\ntitle: ${slug}\ndate: "2026-01-15"\nstatus: published\ntags: []\ncategories: []\ncomments: false\n---\n\n`;

describe("<!--more--> excerpt derivation in FilesystemContentAdapter", () => {
  let tmpDir: string;
  let adapter: FilesystemContentAdapter;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `tintero-test-${crypto.randomUUID()}`);
    const postsDir = path.join(tmpDir, "posts");
    await fs.mkdir(postsDir, { recursive: true });

    // getSiteConfig reads from path.dirname(rootDir)/config/site.yaml
    // rootDir = tmpDir → dirname(tmpDir) is the parent → config at parent/config/site.yaml
    const configDir = path.join(path.dirname(tmpDir), "config");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "site.yaml"),
      MINIMAL_SITE_YAML,
      "utf-8"
    );

    adapter = new FilesystemContentAdapter(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("uses only the teaser portion for auto-excerpt when <!--more--> is present", async () => {
    // Teaser is short; full body is much longer — auto-excerpt of full body would be different
    const teaser = "This is the teaser paragraph.";
    const rest = "A".repeat(200); // longer than 160 chars — would pollute auto-excerpt
    const body = `${MINIMAL_FRONTMATTER("More Tag Post")}${teaser}\n\n<!--more-->\n\n${rest}`;
    await fs.writeFile(
      path.join(tmpDir, "posts", "more-tag-post.md"),
      body,
      "utf-8"
    );

    const { posts } = await adapter.listPosts({ includeDrafts: false });
    expect(posts).toHaveLength(1);
    const post = posts[0];

    // Excerpt must come from the teaser, not from the full body
    expect(post.excerpt).toContain("This is the teaser paragraph");
    // Must NOT contain content from after the marker
    expect(post.excerpt).not.toContain("A".repeat(20));
  });

  it("frontmatter excerpt wins over <!--more--> auto-excerpt", async () => {
    const body = `---\ntitle: Manual Excerpt\ndate: "2026-01-15"\nstatus: published\ntags: []\ncategories: []\ncomments: false\nexcerpt: "Manual excerpt value"\n---\n\nTeaser text.\n\n<!--more-->\n\nRest of post.`;
    await fs.writeFile(
      path.join(tmpDir, "posts", "manual-excerpt.md"),
      body,
      "utf-8"
    );

    const { posts } = await adapter.listPosts({ includeDrafts: false });
    expect(posts).toHaveLength(1);
    expect(posts[0].excerpt).toBe("Manual excerpt value");
  });

  it("auto-excerpt of full body is unchanged when no <!--more--> marker", async () => {
    const fullBody = "This is a post without any more tag.";
    const body = `${MINIMAL_FRONTMATTER("No More Tag")}${fullBody}`;
    await fs.writeFile(
      path.join(tmpDir, "posts", "no-more-tag.md"),
      body,
      "utf-8"
    );

    const { posts } = await adapter.listPosts({ includeDrafts: false });
    expect(posts).toHaveLength(1);
    // Auto-excerpt of full body should be the plain text content
    expect(posts[0].excerpt).toContain("This is a post without any more tag");
  });

  it("getPost also uses teaser for excerpt when <!--more--> is present", async () => {
    const teaser = "Single post teaser.";
    const rest = "B".repeat(200);
    const body = `${MINIMAL_FRONTMATTER("Get Post More")}${teaser}\n\n<!--more-->\n\n${rest}`;
    await fs.writeFile(
      path.join(tmpDir, "posts", "get-post-more.md"),
      body,
      "utf-8"
    );

    const post = await adapter.getPost("get-post-more", { includeDrafts: false });
    expect(post).not.toBeNull();
    expect(post!.excerpt).toContain("Single post teaser");
    expect(post!.excerpt).not.toContain("B".repeat(20));
  });
});
