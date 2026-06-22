import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { FsContentWriter } from "../../../src/lib/content/fs-writer";
import { FsPageWriter } from "../../../src/lib/content/fs-page-writer";
import { FilesystemContentAdapter } from "../../../src/lib/content/fs-adapter";
import type { RevisionRepository } from "../../../src/lib/revisions/ports";

const noopRevisions = () =>
  ({ record: async () => {} }) as unknown as RevisionRepository;

async function makeTmpContentRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-adapter-trash-test-"));
  await fs.mkdir(path.join(root, "posts"), { recursive: true });
  await fs.mkdir(path.join(root, "pages"), { recursive: true });
  return root;
}

async function writePost(postsDir: string, slug: string, title = "Test Post"): Promise<void> {
  const content = `---\ntitle: "${title}"\ndate: "2026-06-18"\nstatus: published\ntags: []\ncategories: []\ncomments: true\n---\n\nBody text.\n`;
  await fs.writeFile(path.join(postsDir, `${slug}.md`), content, "utf-8");
}

async function writePage(pagesDir: string, slug: string, title = "Test Page"): Promise<void> {
  const content = `---\ntitle: "${title}"\ndate: "2026-06-18"\n---\n\nPage body.\n`;
  await fs.writeFile(path.join(pagesDir, `${slug}.md`), content, "utf-8");
}

describe("FilesystemContentAdapter — trash exclusion", () => {
  let contentRoot: string;
  let postsDir: string;
  let pagesDir: string;
  let postWriter: FsContentWriter;
  let pageWriter: FsPageWriter;
  let adapter: FilesystemContentAdapter;

  beforeEach(async () => {
    contentRoot = await makeTmpContentRoot();
    postsDir = path.join(contentRoot, "posts");
    pagesDir = path.join(contentRoot, "pages");
    postWriter = new FsContentWriter(postsDir, noopRevisions);
    pageWriter = new FsPageWriter(pagesDir, noopRevisions);
    adapter = new FilesystemContentAdapter(contentRoot);
  });

  afterEach(async () => {
    await fs.rm(contentRoot, { recursive: true, force: true });
  });

  test("trashed post does NOT appear in listPosts()", async () => {
    await writePost(postsDir, "visible-post", "Visible Post");
    await writePost(postsDir, "trashed-post", "Trashed Post");
    await postWriter.trashPost("trashed-post");

    const { posts } = await adapter.listPosts({ includeDrafts: true });
    const slugs = posts.map((p) => p.slug);
    expect(slugs).toContain("visible-post");
    expect(slugs).not.toContain("trashed-post");
  });

  test("trashed post does NOT appear in getPost()", async () => {
    await writePost(postsDir, "trashed-post", "Trashed Post");
    await postWriter.trashPost("trashed-post");

    const post = await adapter.getPost("trashed-post");
    expect(post).toBeNull();
  });

  test("trashed page does NOT appear in listPages()", async () => {
    await writePage(pagesDir, "visible-page", "Visible Page");
    await writePage(pagesDir, "trashed-page", "Trashed Page");
    await pageWriter.trashPage("trashed-page");

    const { pages } = await adapter.listPages({ includeDrafts: true });
    const slugs = pages.map((p) => p.slug);
    expect(slugs).toContain("visible-page");
    expect(slugs).not.toContain("trashed-page");
  });
});
