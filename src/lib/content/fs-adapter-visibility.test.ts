import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { FilesystemContentAdapter } from "./fs-adapter";

// Helper: write a minimal .md file with given frontmatter and body
async function writePost(
  postsDir: string,
  slug: string,
  frontmatter: Record<string, unknown>,
  body = "Body."
): Promise<void> {
  const fmLines = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (typeof v === "string") return `${k}: "${v}"`;
      if (Array.isArray(v)) return `${k}: [${v.map((x) => `"${x}"`).join(", ")}]`;
      return `${k}: ${v}`;
    })
    .join("\n");
  const content = `---\n${fmLines}\n---\n\n${body}\n`;
  await fs.writeFile(path.join(postsDir, `${slug}.md`), content, "utf-8");
}

describe("FilesystemContentAdapter — visibility filtering", () => {
  let tmpDir: string;
  let rootDir: string;
  let postsDir: string;
  let adapter: FilesystemContentAdapter;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `tintero-adapter-vis-${crypto.randomUUID()}`);
    rootDir = path.join(tmpDir, "content");
    postsDir = path.join(rootDir, "posts");
    await fs.mkdir(postsDir, { recursive: true });
    // Create a minimal config directory so getSiteConfig() doesn't fail
    const configDir = path.join(tmpDir, "config");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "site.yaml"),
      "title: Test\ndescription: ''\nbaseUrl: 'http://localhost:3000'\n",
      "utf-8"
    );
    adapter = new FilesystemContentAdapter(rootDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("private post is excluded from listPosts without includeDrafts", async () => {
    await writePost(postsDir, "private-post", {
      title: "Private",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      visibility: "private",
    });
    const { posts } = await adapter.listPosts({ includeDrafts: false });
    expect(posts.find((p) => p.slug === "private-post")).toBeUndefined();
  });

  it("private post is included in listPosts with includeDrafts", async () => {
    await writePost(postsDir, "private-post2", {
      title: "Private2",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      visibility: "private",
    });
    const { posts } = await adapter.listPosts({ includeDrafts: true });
    expect(posts.find((p) => p.slug === "private-post2")).toBeDefined();
  });

  it("private post is excluded from getPost without includeDrafts", async () => {
    await writePost(postsDir, "private-get", {
      title: "PrivateGet",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      visibility: "private",
    });
    const post = await adapter.getPost("private-get", { includeDrafts: false });
    expect(post).toBeNull();
  });

  it("private post is accessible via getPost with includeDrafts", async () => {
    await writePost(postsDir, "private-get2", {
      title: "PrivateGet2",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      visibility: "private",
    });
    const post = await adapter.getPost("private-get2", { includeDrafts: true });
    expect(post).not.toBeNull();
    expect(post?.visibility).toBe("private");
  });

  it("password post IS included in listPosts without includeDrafts", async () => {
    await writePost(postsDir, "password-post", {
      title: "PasswordPost",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      visibility: "password",
      password: "pw123",
    });
    const { posts } = await adapter.listPosts({ includeDrafts: false });
    expect(posts.find((p) => p.slug === "password-post")).toBeDefined();
  });

  it("password post: body gated and password NOT exposed in public listings", async () => {
    await writePost(postsDir, "vis-prop", {
      title: "VisProp",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      visibility: "password",
      password: "abc",
    }, "SUPER SECRET BODY");
    // Public path (no explicit admin includeDrafts): post is listed (title visible)
    // but the body HTML is withheld and the password is never projected.
    const { posts } = await adapter.listPosts();
    const post = posts.find((p) => p.slug === "vis-prop");
    expect(post?.visibility).toBe("password");
    expect(post?.password).toBeUndefined();
    expect(post?.html).toBe("");
    expect(post?.html).not.toContain("SUPER SECRET BODY");
  });

  it("password post: admin path (includeDrafts) keeps full body and password", async () => {
    await writePost(postsDir, "vis-admin", {
      title: "VisAdmin",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      visibility: "password",
      password: "abc",
    }, "ADMIN VISIBLE BODY");
    const { posts } = await adapter.listPosts({ includeDrafts: true });
    const post = posts.find((p) => p.slug === "vis-admin");
    expect(post?.visibility).toBe("password");
    expect(post?.password).toBe("abc");
    expect(post?.html).toContain("ADMIN VISIBLE BODY");
  });
});
