/**
 * FsPageWriter wired into the shared PageWriter contract suite.
 *
 * This is a REGRESSION gate: the FS writer is the oracle. If any scenario
 * fails here, the contract itself has incorrect expectations.
 *
 * Directory layout mirrors FilesystemContentAdapter's expectations:
 *   <tmpBase>/
 *     content/          ← rootDir for the reader (FilesystemContentAdapter)
 *       pages/          ← where FsPageWriter writes .md files
 *       posts/          ← required by FilesystemContentAdapter (may be empty)
 *     config/
 *       site.yaml       ← read by getSiteConfig()
 *       taxonomies.yaml
 *
 * To run only this file:
 *   bun test test/lib/content/fs-page-writer.contract.test.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FsPageWriter } from "@/lib/content/fs-page-writer";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import { runPageWriterContract, type PageWriterHarness } from "./page-writer-contract";

// ============================================================
// Site YAML helper (minimal — enough for getSiteConfig)
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

async function makeFsPageWriterHarness(): Promise<PageWriterHarness> {
  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-fs-page-writer-contract-")
  );
  const rootDir = path.join(tmpBase, "content");
  const pagesDir = path.join(rootDir, "pages");
  const postsDir = path.join(rootDir, "posts");
  const configDir = path.join(tmpBase, "config");

  await fs.mkdir(pagesDir, { recursive: true });
  await fs.mkdir(postsDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });

  await fs.writeFile(
    path.join(configDir, "site.yaml"),
    buildSiteYaml(),
    "utf-8"
  );
  await fs.writeFile(
    path.join(configDir, "taxonomies.yaml"),
    "tags: []\ncategories: []\n",
    "utf-8"
  );

  const writer = new FsPageWriter(pagesDir);
  // FilesystemContentAdapter expects rootDir (not pagesDir): it appends /pages and /posts.
  // Its getSiteConfig reads from path.dirname(rootDir)/config/site.yaml = <tmpBase>/config/site.yaml.
  const reader = new FilesystemContentAdapter(rootDir);

  return {
    writer,
    reader,
    async cleanup(): Promise<void> {
      await fs.rm(tmpBase, { recursive: true, force: true });
    },
  };
}

// ============================================================
// Run contract
// ============================================================

runPageWriterContract("FsPageWriter", makeFsPageWriterHarness);
