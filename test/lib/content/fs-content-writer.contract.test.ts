/**
 * FsContentWriter wired into the shared ContentWriter contract suite.
 *
 * This is a REGRESSION gate: the FS writer is the oracle. If any scenario
 * fails here, the contract itself has incorrect expectations.
 *
 * Directory layout mirrors FilesystemContentAdapter's expectations:
 *   <tmpBase>/
 *     content/        ← rootDir for the reader (FilesystemContentAdapter)
 *       posts/        ← where FsContentWriter writes .md files
 *     config/
 *       site.yaml     ← read by getSiteConfig()
 *       taxonomies.yaml
 *
 * To run only this file:
 *   bun test test/lib/content/fs-content-writer.contract.test.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FsContentWriter } from "@/lib/content/fs-writer";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import { runContentWriterContract, type WriterHarness } from "./content-writer-contract";

// ============================================================
// Harness factory
// ============================================================

async function makeFsWriterHarness(): Promise<WriterHarness> {
  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-fs-writer-contract-")
  );
  const rootDir = path.join(tmpBase, "content");
  const postsDir = path.join(rootDir, "posts");
  const configDir = path.join(tmpBase, "config");

  await fs.mkdir(postsDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });

  // Minimal site.yaml so FilesystemContentAdapter.getSiteConfig does not warn.
  await fs.writeFile(
    path.join(configDir, "site.yaml"),
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
    ].join("\n") + "\n",
    "utf-8"
  );
  await fs.writeFile(
    path.join(configDir, "taxonomies.yaml"),
    "tags: []\ncategories: []\n",
    "utf-8"
  );

  const writer = new FsContentWriter(postsDir);
  // FilesystemContentAdapter expects rootDir (not postsDir): it appends /posts and /pages.
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

runContentWriterContract("FsContentWriter", makeFsWriterHarness);
