/**
 * DrizzlePageWriter wired into the shared PageWriter contract suite.
 *
 * Uses an isolated libSQL database with the same DDL as
 * drizzle-content-repository.contract.test.ts. The DrizzleContentAdapter
 * (reader) is wired to the same DB so writes are immediately visible through
 * the read path.
 *
 * GREEN gate: all contract scenarios must pass. The FS contract
 * (fs-page-writer.contract.test.ts) characterizes what each scenario
 * expects; passing both proves parity.
 *
 * To run only this file:
 *   bun test test/lib/content/drizzle-page-writer.contract.test.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as schema from "@/lib/content/schema.sqlite";
import { DrizzleContentAdapter } from "@/lib/content/drizzle-adapter";
import { DrizzlePageWriter } from "@/lib/content/drizzle-page-writer";
import { runPageWriterContract, type PageWriterHarness } from "./page-writer-contract";
import { makeTestContentDb } from "./make-test-content-db";

// ============================================================
// DDL — identical to drizzle-content-repository.contract.test.ts
// ============================================================

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

CREATE INDEX IF NOT EXISTS idx_content_type_status
  ON content (type, status);

CREATE INDEX IF NOT EXISTS idx_content_parent_id
  ON content (parent_id);

CREATE INDEX IF NOT EXISTS idx_content_author_id
  ON content (author_id);

CREATE INDEX IF NOT EXISTS idx_content_deleted_at
  ON content (deleted_at);

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

CREATE INDEX IF NOT EXISTS idx_terms_parent_id
  ON terms (parent_id);

CREATE TABLE IF NOT EXISTS term_relationships (
  content_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  PRIMARY KEY (content_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_term_rel_content_id
  ON term_relationships (content_id);

CREATE INDEX IF NOT EXISTS idx_term_rel_term_id
  ON term_relationships (term_id);

CREATE TABLE IF NOT EXISTS content_meta (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  meta_key TEXT NOT NULL,
  meta_value TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_meta_content_id_meta_key
  ON content_meta (content_id, meta_key);
`;

// ============================================================
// Site YAML helpers (minimal — enough for getSiteConfig)
// ============================================================

function buildSiteYaml(): string {
  return (
    [
      'title: "Test Site"',
      'description: ""',
      'baseUrl: "http://localhost:3000"',
      "language: en",
      "author:",
      '  name: "Test Author"',
      "reading:",
      "  homepage: latest-posts",
      "  posts_per_page: 10",
      "comments:",
      "  enabled: false",
      "  moderation: manual",
    ].join("\n") + "\n"
  );
}

// ============================================================
// Harness factory
// ============================================================

async function makeDrizzlePageWriterHarness(): Promise<PageWriterHarness> {
  const { db, cleanup: closeDb } = await makeTestContentDb(DDL);

  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-drizzle-page-writer-contract-")
  );
  const configDir = path.join(tmpBase, "config");
  await fs.mkdir(configDir, { recursive: true });

  await fs.writeFile(path.join(configDir, "site.yaml"), buildSiteYaml(), "utf-8");
  await fs.writeFile(
    path.join(configDir, "taxonomies.yaml"),
    "tags: []\ncategories: []\n",
    "utf-8"
  );

  const writer = new DrizzlePageWriter(db, schema);
  // Reader shares the same in-memory DB: writes are immediately visible.
  const reader = new DrizzleContentAdapter(db, configDir, schema);

  return {
    writer,
    reader,
    async cleanup(): Promise<void> {
      closeDb();
      await fs.rm(tmpBase, { recursive: true, force: true });
    },
  };
}

// ============================================================
// Run contract
// ============================================================

runPageWriterContract("DrizzlePageWriter", makeDrizzlePageWriterHarness);
