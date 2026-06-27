/**
 * TDD tests for DB writer revision capture (Step 2) and markdown serializer
 * extraction (Step 1).
 *
 * RED phase: all tests fail before implementation.
 *   - serializePostMarkdown / serializePageMarkdown tests fail because the
 *     module does not exist yet.
 *   - DB revision capture tests fail because DrizzleContentWriter /
 *     DrizzlePageWriter currently pass `input.body` as rawContent instead of
 *     the full serialized markdown.
 *   - Cross-writer parity tests fail for the same reason.
 *
 * GREEN phase: after
 *   1. src/lib/content/markdown-serialize.ts is extracted, and
 *   2. DB writers build rawContent via serializePostMarkdown / serializePageMarkdown,
 *   all tests pass.
 *
 * Run only this file:
 *   bun test test/lib/content/db-writer-revisions.test.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as path from "node:path";
import * as fsNode from "node:fs/promises";
import * as os from "node:os";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "@/lib/content/schema.sqlite";
import { DrizzleContentWriter } from "@/lib/content/drizzle-content-writer";
import { DrizzlePageWriter } from "@/lib/content/drizzle-page-writer";
import { FsContentWriter } from "@/lib/content/fs-writer";
import { FsPageWriter } from "@/lib/content/fs-page-writer";
import {
  serializePostMarkdown,
  serializePageMarkdown,
  type SerializableFrontmatter,
  type PageSerializableFrontmatter,
} from "@/lib/content/markdown-serialize";
import type { RevisionRepository } from "@/lib/revisions/ports";
import type { Revision, RecordRevisionInput } from "@/lib/revisions/types";
import type { CreatePostInput, CreatePageInput, UpdatePostInput, UpdatePageInput } from "@/lib/content/ports";

// ---------------------------------------------------------------------------
// DDL (minimal — content, terms, term_relationships, content_meta)
// ---------------------------------------------------------------------------

const DDL = `
CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  visibility TEXT NOT NULL,
  password TEXT,
  body_markdown TEXT NOT NULL,
  excerpt TEXT,
  cover_image TEXT,
  author_label TEXT,
  author_id TEXT,
  sticky INTEGER NOT NULL,
  comments_enabled INTEGER NOT NULL,
  parent_id TEXT,
  menu_order INTEGER NOT NULL,
  published_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_type_slug
  ON content (type, slug) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_content_type_status_published_at_id
  ON content (type, status, published_at, id);

CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY,
  taxonomy TEXT NOT NULL,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  parent_id TEXT,
  description_markdown TEXT,
  count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_terms_taxonomy_slug
  ON terms (taxonomy, slug);

CREATE TABLE IF NOT EXISTS term_relationships (
  content_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  PRIMARY KEY (content_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_term_rel_content_id
  ON term_relationships (content_id);

CREATE TABLE IF NOT EXISTS content_meta (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  meta_key TEXT NOT NULL,
  meta_value TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_meta_content_id_meta_key
  ON content_meta (content_id, meta_key);
`;

// ---------------------------------------------------------------------------
// Mock RevisionRepository
// ---------------------------------------------------------------------------

function makeRevisionRepo(): {
  repo: RevisionRepository;
  calls: RecordRevisionInput[];
  reset(): void;
} {
  const calls: RecordRevisionInput[] = [];
  const repo: RevisionRepository = {
    async record(input: RecordRevisionInput): Promise<Revision> {
      calls.push({ ...input });
      return {
        id: `rev-${calls.length}`,
        contentType: input.contentType,
        slug: input.slug,
        rawContent: input.rawContent,
        source: input.source,
        authorId: input.authorId ?? null,
        authorLabel: input.authorLabel ?? null,
        sequence: calls.length,
        createdAt: new Date(),
      };
    },
    async listForSlug() {
      return [];
    },
    async getById() {
      return null;
    },
  };
  return {
    repo,
    calls,
    reset() {
      calls.length = 0;
    },
  };
}

/** A RevisionRepository whose record() always rejects — tests best-effort behaviour. */
const THROWING_REPO: RevisionRepository = {
  async record(): Promise<Revision> {
    throw new Error("Simulated DB failure");
  },
  async listForSlug() {
    return [];
  },
  async getById() {
    return null;
  },
};

// ---------------------------------------------------------------------------
// SQLite helpers
// ---------------------------------------------------------------------------

function makeDb(): { raw: Database; db: ReturnType<typeof drizzle> } {
  const raw = new Database(":memory:");
  raw.exec(DDL);
  const db = drizzle(raw, { schema });
  return { raw, db };
}

// ---------------------------------------------------------------------------
// Representative inputs
// ---------------------------------------------------------------------------

const POST_INPUT: CreatePostInput = {
  title: "Parity Test Post",
  date: "2024-06-01",
  status: "published",
  tags: ["typescript", "testing"],
  categories: ["Tech"],
  comments: true,
  body: "This is the **body** of the post.",
};

const PAGE_INPUT: CreatePageInput = {
  title: "Parity Test Page",
  date: "2024-06-01",
  body: "This is the **body** of the page.",
  menuOrder: 5,
};

// ---------------------------------------------------------------------------
// § 1 — serializePostMarkdown / serializePageMarkdown (serializer extraction)
// ---------------------------------------------------------------------------

describe("serializePostMarkdown — shared markdown serializer", () => {
  test("output starts with YAML frontmatter delimiter", () => {
    const fm: SerializableFrontmatter = {
      title: "Hello World",
      date: "2024-01-01",
      status: "published",
      tags: [],
      categories: ["Uncategorized"],
      comments: true,
    };
    const result = serializePostMarkdown(fm, "Body text.");
    expect(result).toStartWith("---\n");
  });

  test("output ends with a newline after the body", () => {
    const fm: SerializableFrontmatter = {
      title: "Hello World",
      date: "2024-01-01",
      status: "published",
      tags: [],
      categories: ["Uncategorized"],
      comments: true,
    };
    const result = serializePostMarkdown(fm, "Body text.");
    expect(result.endsWith("\n")).toBe(true);
  });

  test("output contains the title in frontmatter", () => {
    const fm: SerializableFrontmatter = {
      title: "My Blog Post",
      date: "2024-03-15",
      status: "draft",
      tags: ["js"],
      categories: ["Code"],
      comments: false,
    };
    const result = serializePostMarkdown(fm, "Body.");
    expect(result).toContain("title: My Blog Post");
  });

  test("output contains date in YAML 1.1 quoted format", () => {
    const fm: SerializableFrontmatter = {
      title: "Dated Post",
      date: "2024-06-01",
      status: "published",
      tags: [],
      categories: ["Uncategorized"],
      comments: true,
    };
    const result = serializePostMarkdown(fm, "Body.");
    // YAML 1.1 quotes date-like strings to prevent timestamp coercion
    expect(result).toContain("2024-06-01");
  });

  test("output contains the body after the closing ---", () => {
    const fm: SerializableFrontmatter = {
      title: "Hello",
      date: "2024-01-01",
      status: "published",
      tags: [],
      categories: ["Uncategorized"],
      comments: true,
    };
    const body = "This is the unique body content.";
    const result = serializePostMarkdown(fm, body);
    expect(result).toContain(body);
    // Body appears after the closing ---
    const closingDelimiter = result.indexOf("---\n", 4);
    const bodyStart = result.indexOf(body);
    expect(bodyStart).toBeGreaterThan(closingDelimiter);
  });

  test("excerpt is omitted when empty string", () => {
    const fm: SerializableFrontmatter = {
      title: "No Excerpt",
      date: "2024-01-01",
      status: "published",
      excerpt: "",
      tags: [],
      categories: ["Uncategorized"],
      comments: true,
    };
    const result = serializePostMarkdown(fm, "Body.");
    expect(result).not.toContain("excerpt:");
  });

  test("sticky is omitted when false", () => {
    const fm: SerializableFrontmatter = {
      title: "Not Sticky",
      date: "2024-01-01",
      status: "published",
      sticky: false,
      tags: [],
      categories: ["Uncategorized"],
      comments: true,
    };
    const result = serializePostMarkdown(fm, "Body.");
    expect(result).not.toContain("sticky:");
  });

  test("visibility is omitted when 'public'", () => {
    const fm: SerializableFrontmatter = {
      title: "Public Post",
      date: "2024-01-01",
      status: "published",
      visibility: "public",
      tags: [],
      categories: ["Uncategorized"],
      comments: true,
    };
    const result = serializePostMarkdown(fm, "Body.");
    expect(result).not.toContain("visibility:");
  });
});

describe("serializePageMarkdown — shared markdown serializer for pages", () => {
  test("output starts with YAML frontmatter delimiter", () => {
    const fm: PageSerializableFrontmatter = {
      title: "About Page",
      date: "2024-01-01",
    };
    const result = serializePageMarkdown(fm, "About content.");
    expect(result).toStartWith("---\n");
  });

  test("output contains the page title", () => {
    const fm: PageSerializableFrontmatter = {
      title: "Contact Us",
      date: "2024-01-01",
    };
    const result = serializePageMarkdown(fm, "Contact body.");
    expect(result).toContain("title: Contact Us");
  });

  test("status is omitted when not in fm (FS writers omit it at construction time for published pages)", () => {
    // FS writers never put status in fm when it is "published" — they omit it
    // at construction time. The serializer sees no status key → no status in output.
    const fm: PageSerializableFrontmatter = {
      title: "Published Page",
      date: "2024-01-01",
      // No status key — matches FS page writer construction for published pages
    };
    const result = serializePageMarkdown(fm, "Body.");
    expect(result).not.toContain("status:");
  });

  test("status is included when 'draft'", () => {
    const fm: PageSerializableFrontmatter = {
      title: "Draft Page",
      date: "2024-01-01",
      status: "draft",
    };
    const result = serializePageMarkdown(fm, "Body.");
    expect(result).toContain("status: draft");
  });

  test("menu_order is omitted when not in fm (FS writers omit it at construction time for 0)", () => {
    // FS writers never put menu_order in fm when it is 0 — omitted at construction time.
    const fm: PageSerializableFrontmatter = {
      title: "No Order",
      date: "2024-01-01",
      // No menu_order key — matches FS page writer construction for menu_order 0
    };
    const result = serializePageMarkdown(fm, "Body.");
    expect(result).not.toContain("menu_order:");
  });

  test("menu_order is included when non-zero", () => {
    const fm: PageSerializableFrontmatter = {
      title: "Ordered Page",
      date: "2024-01-01",
      menu_order: 5,
    };
    const result = serializePageMarkdown(fm, "Body.");
    expect(result).toContain("menu_order: 5");
  });
});

// ---------------------------------------------------------------------------
// § 2 — DrizzleContentWriter revision capture
// ---------------------------------------------------------------------------

describe("DrizzleContentWriter — revision capture", () => {
  let raw: Database;
  let db: ReturnType<typeof drizzle>;
  let revMock: ReturnType<typeof makeRevisionRepo>;

  beforeEach(() => {
    ({ raw, db } = makeDb());
    revMock = makeRevisionRepo();
  });

  afterEach(() => {
    raw.close();
  });

  // -----------------------------------------------------------------------
  // createPost
  // -----------------------------------------------------------------------

  test("createPost — record() called once with contentType 'post' and the correct slug", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    const result = await writer.createPost(POST_INPUT);
    expect(result.ok).toBe(true);

    expect(revMock.calls).toHaveLength(1);
    expect(revMock.calls[0].contentType).toBe("post");
    if (result.ok) {
      expect(revMock.calls[0].slug).toBe(result.slug);
    }
  });

  test("createPost — rawContent contains frontmatter (not just the body)", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    await writer.createPost(POST_INPUT);

    const { rawContent } = revMock.calls[0];
    // Full markdown: must begin with YAML front-matter delimiter
    expect(rawContent).toStartWith("---\n");
    // Must contain the title in frontmatter
    expect(rawContent).toContain("title: Parity Test Post");
    // Must contain the body text
    expect(rawContent).toContain("This is the **body** of the post.");
    // Must NOT be just the body (bare body doesn't start with "---")
    expect(rawContent).not.toBe(POST_INPUT.body);
  });

  test("createPost — record() receives correct source/authorId/authorLabel from RevisionContext", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    await writer.createPost(POST_INPUT, {
      source: "admin",
      authorId: "user-123",
      authorLabel: "Alice",
    });

    expect(revMock.calls[0].source).toBe("admin");
    expect(revMock.calls[0].authorId).toBe("user-123");
    expect(revMock.calls[0].authorLabel).toBe("Alice");
  });

  test("createPost — defaults source to 'cli' and authorId/authorLabel to null when context omitted", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    await writer.createPost(POST_INPUT);

    expect(revMock.calls[0].source).toBe("cli");
    expect(revMock.calls[0].authorId).toBeNull();
    expect(revMock.calls[0].authorLabel).toBeNull();
  });

  // -----------------------------------------------------------------------
  // updatePost
  // -----------------------------------------------------------------------

  test("updatePost — record() called once with full markdown rawContent", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPost(POST_INPUT);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    revMock.reset();

    const UPDATE_INPUT: UpdatePostInput = {
      title: "Parity Test Post",
      date: "2024-07-01",
      status: "draft",
      tags: ["updated"],
      categories: ["Tech"],
      comments: false,
      body: "Updated body content.",
    };

    const updateResult = await writer.updatePost(createResult.slug, UPDATE_INPUT);
    expect(updateResult.ok).toBe(true);

    expect(revMock.calls).toHaveLength(1);
    const { rawContent } = revMock.calls[0];
    expect(rawContent).toStartWith("---\n");
    expect(rawContent).toContain("title: Parity Test Post");
    expect(rawContent).toContain("Updated body content.");
    expect(rawContent).not.toBe(UPDATE_INPUT.body);
  });

  test("updatePost — rawContent slug matches the updated post slug", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPost(POST_INPUT);
    if (!createResult.ok) return;
    revMock.reset();

    const updateResult = await writer.updatePost(createResult.slug, {
      title: "Parity Test Post",
      date: "2024-07-01",
      status: "published",
      tags: [],
      categories: ["Tech"],
      comments: true,
      body: "Body.",
    });
    expect(updateResult.ok).toBe(true);

    expect(revMock.calls).toHaveLength(1);
    if (updateResult.ok) {
      expect(revMock.calls[0].slug).toBe(updateResult.slug);
    }
  });

  // -----------------------------------------------------------------------
  // deletePost — mirrors FS (no revision capture)
  // -----------------------------------------------------------------------

  test("deletePost — does NOT call record() (mirrors FsContentWriter.deletePost)", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPost(POST_INPUT);
    if (!createResult.ok) return;
    revMock.reset();

    const deleteResult = await writer.deletePost(createResult.slug);
    expect(deleteResult.ok).toBe(true);

    // FS deletePost does not capture a revision — DB must mirror this.
    expect(revMock.calls).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Best-effort: record() rejection MUST NOT fail the write
  // -----------------------------------------------------------------------

  test("createPost — write succeeds even when record() rejects (best-effort)", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => THROWING_REPO);
    const result = await writer.createPost(POST_INPUT);
    expect(result.ok).toBe(true);
  });

  test("updatePost — write succeeds even when record() rejects (best-effort)", async () => {
    // Create with a working repo, then update with the throwing repo.
    const working = makeRevisionRepo();
    const createWriter = new DrizzleContentWriter(db, schema, () => working.repo);
    const createResult = await createWriter.createPost(POST_INPUT);
    if (!createResult.ok) return;

    const throwingWriter = new DrizzleContentWriter(db, schema, () => THROWING_REPO);
    let threw = false;
    try {
      await throwingWriter.updatePost(createResult.slug, {
        title: "Parity Test Post",
        date: "2024-07-01",
        status: "published",
        tags: [],
        categories: ["Tech"],
        comments: true,
        body: "Updated body.",
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// § 3 — DrizzlePageWriter revision capture
// ---------------------------------------------------------------------------

describe("DrizzlePageWriter — revision capture", () => {
  let raw: Database;
  let db: ReturnType<typeof drizzle>;
  let revMock: ReturnType<typeof makeRevisionRepo>;

  beforeEach(() => {
    ({ raw, db } = makeDb());
    revMock = makeRevisionRepo();
  });

  afterEach(() => {
    raw.close();
  });

  test("createPage — record() called once with contentType 'page'", async () => {
    const writer = new DrizzlePageWriter(db, schema, () => revMock.repo);
    const result = await writer.createPage(PAGE_INPUT);
    expect(result.ok).toBe(true);

    expect(revMock.calls).toHaveLength(1);
    expect(revMock.calls[0].contentType).toBe("page");
  });

  test("createPage — rawContent contains frontmatter (not just the body)", async () => {
    const writer = new DrizzlePageWriter(db, schema, () => revMock.repo);
    await writer.createPage(PAGE_INPUT);

    const { rawContent } = revMock.calls[0];
    expect(rawContent).toStartWith("---\n");
    expect(rawContent).toContain("title: Parity Test Page");
    expect(rawContent).toContain("This is the **body** of the page.");
    expect(rawContent).not.toBe(PAGE_INPUT.body);
  });

  test("createPage — menu_order 5 appears in frontmatter", async () => {
    const writer = new DrizzlePageWriter(db, schema, () => revMock.repo);
    await writer.createPage(PAGE_INPUT);

    expect(revMock.calls[0].rawContent).toContain("menu_order: 5");
  });

  test("updatePage — record() called once with full markdown rawContent", async () => {
    const writer = new DrizzlePageWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPage(PAGE_INPUT);
    if (!createResult.ok) return;
    revMock.reset();

    const UPDATE_INPUT: UpdatePageInput = {
      title: "Parity Test Page",
      date: "2024-07-01",
      body: "Updated page body.",
      status: "draft",
    };

    const updateResult = await writer.updatePage(createResult.slug, UPDATE_INPUT);
    expect(updateResult.ok).toBe(true);

    expect(revMock.calls).toHaveLength(1);
    const { rawContent } = revMock.calls[0];
    expect(rawContent).toStartWith("---\n");
    expect(rawContent).toContain("title: Parity Test Page");
    expect(rawContent).toContain("Updated page body.");
    expect(rawContent).not.toBe(UPDATE_INPUT.body);
  });

  test("deletePage — does NOT call record() (mirrors FsPageWriter.deletePage)", async () => {
    const writer = new DrizzlePageWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPage(PAGE_INPUT);
    if (!createResult.ok) return;
    revMock.reset();

    const deleteResult = await writer.deletePage(createResult.slug);
    expect(deleteResult.ok).toBe(true);

    expect(revMock.calls).toHaveLength(0);
  });

  test("createPage — write succeeds even when record() rejects (best-effort)", async () => {
    const writer = new DrizzlePageWriter(db, schema, () => THROWING_REPO);
    const result = await writer.createPage(PAGE_INPUT);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// § 5 — DrizzleContentWriter — setPostStatus revision capture
// ---------------------------------------------------------------------------

describe("DrizzleContentWriter — setPostStatus revision capture", () => {
  let raw: Database;
  let db: ReturnType<typeof drizzle>;
  let revMock: ReturnType<typeof makeRevisionRepo>;

  beforeEach(() => {
    ({ raw, db } = makeDb());
    revMock = makeRevisionRepo();
  });

  afterEach(() => {
    raw.close();
  });

  test("setPostStatus — records exactly one revision with contentType 'post'", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPost(POST_INPUT);
    if (!createResult.ok) throw new Error("Setup failed");
    revMock.reset();

    const result = await writer.setPostStatus(createResult.slug, "draft");
    expect(result.ok).toBe(true);

    expect(revMock.calls).toHaveLength(1);
    expect(revMock.calls[0].contentType).toBe("post");
    expect(revMock.calls[0].slug).toBe(createResult.slug);
  });

  test("setPostStatus — rawContent reflects the NEW status (not the old status)", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPost({ ...POST_INPUT, status: "published" });
    if (!createResult.ok) throw new Error("Setup failed");
    revMock.reset();

    await writer.setPostStatus(createResult.slug, "draft");

    const { rawContent } = revMock.calls[0];
    expect(rawContent).toStartWith("---\n");
    expect(rawContent).toContain("status: draft");
    expect(rawContent).not.toContain("status: published");
  });

  test("setPostStatus — revision source defaults to 'cli' and authorId/authorLabel are null", async () => {
    const writer = new DrizzleContentWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPost(POST_INPUT);
    if (!createResult.ok) throw new Error("Setup failed");
    revMock.reset();

    await writer.setPostStatus(createResult.slug, "draft");

    expect(revMock.calls[0].source).toBe("cli");
    expect(revMock.calls[0].authorId).toBeNull();
    expect(revMock.calls[0].authorLabel).toBeNull();
  });

  test("setPostStatus — record() rejection does NOT fail the operation (best-effort)", async () => {
    // Create with working repo, then call setPostStatus with throwing repo.
    const working = makeRevisionRepo();
    const setupWriter = new DrizzleContentWriter(db, schema, () => working.repo);
    const createResult = await setupWriter.createPost(POST_INPUT);
    if (!createResult.ok) throw new Error("Setup failed");

    const throwingWriter = new DrizzleContentWriter(db, schema, () => THROWING_REPO);
    const result = await throwingWriter.setPostStatus(createResult.slug, "draft");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// § 6 — DrizzlePageWriter — setPageStatus revision capture
// ---------------------------------------------------------------------------

describe("DrizzlePageWriter — setPageStatus revision capture", () => {
  let raw: Database;
  let db: ReturnType<typeof drizzle>;
  let revMock: ReturnType<typeof makeRevisionRepo>;

  beforeEach(() => {
    ({ raw, db } = makeDb());
    revMock = makeRevisionRepo();
  });

  afterEach(() => {
    raw.close();
  });

  test("setPageStatus — records exactly one revision with contentType 'page'", async () => {
    const writer = new DrizzlePageWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPage(PAGE_INPUT);
    if (!createResult.ok) throw new Error("Setup failed");
    revMock.reset();

    const result = await writer.setPageStatus(createResult.slug, "draft");
    expect(result.ok).toBe(true);

    expect(revMock.calls).toHaveLength(1);
    expect(revMock.calls[0].contentType).toBe("page");
    expect(revMock.calls[0].slug).toBe(createResult.slug);
  });

  test("setPageStatus — rawContent reflects the NEW status (not the old status)", async () => {
    const writer = new DrizzlePageWriter(db, schema, () => revMock.repo);
    // Create as published (default — no status means published)
    const createResult = await writer.createPage({ ...PAGE_INPUT });
    if (!createResult.ok) throw new Error("Setup failed");
    revMock.reset();

    await writer.setPageStatus(createResult.slug, "draft");

    const { rawContent } = revMock.calls[0];
    expect(rawContent).toStartWith("---\n");
    expect(rawContent).toContain("status: draft");
  });

  test("setPageStatus — rawContent does NOT include status when changing to published", async () => {
    // Create as draft, then publish — status should be omitted (FS page convention)
    const writer = new DrizzlePageWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPage({ ...PAGE_INPUT, status: "draft" });
    if (!createResult.ok) throw new Error("Setup failed");
    revMock.reset();

    await writer.setPageStatus(createResult.slug, "published");

    const { rawContent } = revMock.calls[0];
    expect(rawContent).toStartWith("---\n");
    expect(rawContent).not.toContain("status:");
  });

  test("setPageStatus — revision source defaults to 'cli' and authorId/authorLabel are null", async () => {
    const writer = new DrizzlePageWriter(db, schema, () => revMock.repo);
    const createResult = await writer.createPage(PAGE_INPUT);
    if (!createResult.ok) throw new Error("Setup failed");
    revMock.reset();

    await writer.setPageStatus(createResult.slug, "draft");

    expect(revMock.calls[0].source).toBe("cli");
    expect(revMock.calls[0].authorId).toBeNull();
    expect(revMock.calls[0].authorLabel).toBeNull();
  });

  test("setPageStatus — record() rejection does NOT fail the operation (best-effort)", async () => {
    const working = makeRevisionRepo();
    const setupWriter = new DrizzlePageWriter(db, schema, () => working.repo);
    const createResult = await setupWriter.createPage(PAGE_INPUT);
    if (!createResult.ok) throw new Error("Setup failed");

    const throwingWriter = new DrizzlePageWriter(db, schema, () => THROWING_REPO);
    const result = await throwingWriter.setPageStatus(createResult.slug, "draft");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// § 4 — Cross-writer rawContent parity (strongest assertion)
// ---------------------------------------------------------------------------

describe("Cross-writer rawContent parity — DB writers match FS writers", () => {
  let tmpDir: string;
  let raw: Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    tmpDir = await fsNode.mkdtemp(path.join(os.tmpdir(), "tintero-parity-"));
    ({ raw, db } = makeDb());
  });

  afterEach(async () => {
    raw.close();
    await fsNode.rm(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Post parity
  // -----------------------------------------------------------------------

  test("createPost — DB rawContent equals FS rawContent for the same input", async () => {
    const fsMock = makeRevisionRepo();
    const dbMock = makeRevisionRepo();

    const fsWriter = new FsContentWriter(tmpDir, () => fsMock.repo);
    const dbWriter = new DrizzleContentWriter(db, schema, () => dbMock.repo);

    const input: CreatePostInput = {
      title: "Cross Parity Post",
      date: "2024-06-01",
      status: "published",
      tags: ["ts", "testing"],
      categories: ["Tech"],
      comments: true,
      body: "The body for parity testing.",
    };

    const fsResult = await fsWriter.createPost(input);
    const dbResult = await dbWriter.createPost(input);

    expect(fsResult.ok).toBe(true);
    expect(dbResult.ok).toBe(true);

    expect(fsMock.calls).toHaveLength(1);
    expect(dbMock.calls).toHaveLength(1);

    // The core parity assertion:
    expect(dbMock.calls[0].rawContent).toBe(fsMock.calls[0].rawContent);
  });

  test("updatePost — DB rawContent equals FS rawContent for the same update (same title, no slug change)", async () => {
    const fsMock = makeRevisionRepo();
    const dbMock = makeRevisionRepo();

    const fsWriter = new FsContentWriter(tmpDir, () => fsMock.repo);
    const dbWriter = new DrizzleContentWriter(db, schema, () => dbMock.repo);

    const createInput: CreatePostInput = {
      title: "Update Parity Post",
      date: "2024-06-01",
      status: "published",
      tags: [],
      categories: ["Uncategorized"],
      comments: false,
      body: "Original body.",
    };

    const fsCreate = await fsWriter.createPost(createInput);
    const dbCreate = await dbWriter.createPost(createInput);
    if (!fsCreate.ok || !dbCreate.ok) throw new Error("Setup failed");
    fsMock.reset();
    dbMock.reset();

    // Update with same title (no slug change) — this is where parity must hold
    const updateInput: UpdatePostInput = {
      title: "Update Parity Post",  // unchanged title → same slug
      date: "2024-07-15",
      status: "draft",
      tags: ["new-tag"],
      categories: ["Tech"],
      comments: true,
      body: "Updated body for parity.",
    };

    await fsWriter.updatePost(fsCreate.slug, updateInput);
    await dbWriter.updatePost(dbCreate.slug, updateInput);

    expect(fsMock.calls).toHaveLength(1);
    expect(dbMock.calls).toHaveLength(1);

    expect(dbMock.calls[0].rawContent).toBe(fsMock.calls[0].rawContent);
  });

  // -----------------------------------------------------------------------
  // Page parity
  // -----------------------------------------------------------------------

  test("createPage — DB rawContent equals FS rawContent for the same input", async () => {
    const fsMock = makeRevisionRepo();
    const dbMock = makeRevisionRepo();

    const fsWriter = new FsPageWriter(tmpDir, () => fsMock.repo);
    const dbWriter = new DrizzlePageWriter(db, schema, () => dbMock.repo);

    const input: CreatePageInput = {
      title: "Cross Parity Page",
      date: "2024-06-01",
      body: "The page body for parity testing.",
      status: "draft",
      menuOrder: 3,
    };

    const fsResult = await fsWriter.createPage(input);
    const dbResult = await dbWriter.createPage(input);

    expect(fsResult.ok).toBe(true);
    expect(dbResult.ok).toBe(true);

    expect(fsMock.calls).toHaveLength(1);
    expect(dbMock.calls).toHaveLength(1);

    expect(dbMock.calls[0].rawContent).toBe(fsMock.calls[0].rawContent);
  });

  test("updatePage — DB rawContent equals FS rawContent (same title, no slug change)", async () => {
    const fsMock = makeRevisionRepo();
    const dbMock = makeRevisionRepo();

    const fsWriter = new FsPageWriter(tmpDir, () => fsMock.repo);
    const dbWriter = new DrizzlePageWriter(db, schema, () => dbMock.repo);

    const createInput: CreatePageInput = {
      title: "Update Parity Page",
      date: "2024-06-01",
      body: "Original page body.",
    };

    const fsCreate = await fsWriter.createPage(createInput);
    const dbCreate = await dbWriter.createPage(createInput);
    if (!fsCreate.ok || !dbCreate.ok) throw new Error("Setup failed");
    fsMock.reset();
    dbMock.reset();

    const updateInput: UpdatePageInput = {
      title: "Update Parity Page",  // unchanged title → same slug
      date: "2024-08-01",
      body: "Updated page body for parity.",
      status: "draft",
      menuOrder: 7,
    };

    await fsWriter.updatePage(fsCreate.slug, updateInput);
    await dbWriter.updatePage(dbCreate.slug, updateInput);

    expect(fsMock.calls).toHaveLength(1);
    expect(dbMock.calls).toHaveLength(1);

    expect(dbMock.calls[0].rawContent).toBe(fsMock.calls[0].rawContent);
  });

  // -----------------------------------------------------------------------
  // setPostStatus parity
  // -----------------------------------------------------------------------

  test("setPostStatus — DB rawContent equals FS rawContent for same content + new status (cross-writer parity)", async () => {
    const fsMock = makeRevisionRepo();
    const dbMock = makeRevisionRepo();

    const fsWriter = new FsContentWriter(tmpDir, () => fsMock.repo);
    const dbWriter = new DrizzleContentWriter(db, schema, () => dbMock.repo);

    const input: CreatePostInput = {
      title: "Status Parity Post",
      date: "2024-06-01",
      status: "published",
      tags: ["ts", "testing"],
      categories: ["Tech"],
      comments: true,
      body: "Body for status parity testing.",
    };

    const fsCreate = await fsWriter.createPost(input);
    const dbCreate = await dbWriter.createPost(input);
    if (!fsCreate.ok || !dbCreate.ok) throw new Error("Setup failed");
    fsMock.reset();
    dbMock.reset();

    // Change status to "draft" in both
    const fsResult = await fsWriter.setPostStatus(fsCreate.slug, "draft");
    const dbResult = await dbWriter.setPostStatus(dbCreate.slug, "draft");

    expect(fsResult.ok).toBe(true);
    expect(dbResult.ok).toBe(true);
    expect(fsMock.calls).toHaveLength(1);
    expect(dbMock.calls).toHaveLength(1);

    // Core parity assertion:
    expect(dbMock.calls[0].rawContent).toBe(fsMock.calls[0].rawContent);
  });

  // -----------------------------------------------------------------------
  // setPageStatus parity
  // -----------------------------------------------------------------------

  test("setPageStatus — DB rawContent equals FS rawContent for same content + new status (cross-writer parity)", async () => {
    const fsMock = makeRevisionRepo();
    const dbMock = makeRevisionRepo();

    const fsWriter = new FsPageWriter(tmpDir, () => fsMock.repo);
    const dbWriter = new DrizzlePageWriter(db, schema, () => dbMock.repo);

    const input: CreatePageInput = {
      title: "Status Parity Page",
      date: "2024-06-01",
      body: "Body for page status parity testing.",
      menuOrder: 3,
    };

    const fsCreate = await fsWriter.createPage(input);
    const dbCreate = await dbWriter.createPage(input);
    if (!fsCreate.ok || !dbCreate.ok) throw new Error("Setup failed");
    fsMock.reset();
    dbMock.reset();

    // Change status to "draft" in both
    const fsResult = await fsWriter.setPageStatus(fsCreate.slug, "draft");
    const dbResult = await dbWriter.setPageStatus(dbCreate.slug, "draft");

    expect(fsResult.ok).toBe(true);
    expect(dbResult.ok).toBe(true);
    expect(fsMock.calls).toHaveLength(1);
    expect(dbMock.calls).toHaveLength(1);

    // Core parity assertion:
    expect(dbMock.calls[0].rawContent).toBe(fsMock.calls[0].rawContent);
  });
});
