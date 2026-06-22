// Fingerprint module — computes per-area mtime+size fingerprints for content dirs.
// These fingerprints are used as explicit cache-key arguments to the module-level
// 'use cache' functions in repository.ts, enabling per-request cache invalidation
// when files change without any server restart.
//
// CRITICAL: This file MUST NOT contain 'use cache' anywhere.
// It IS the cache key — caching these functions would defeat the mechanism.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Recursively stat-walks `dir`, mirroring the collectMarkdownFiles logic in
 * fs-adapter.ts: skips dotfiles/dot-directories (including .obsidian), skips
 * non-.md files, and descends into subdirectories.
 *
 * Returns an array of lines in the form "relPath:size:mtimeMs" — one per .md file.
 * Missing dir → returns [] without throwing (catches readdir ENOENT).
 */
async function walkStat(dir: string, rootDir: string): Promise<string[]> {
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // Missing or inaccessible dir → stable empty result (ADR-G)
    return [];
  }

  const out: string[] = [];

  for (const entry of entries) {
    // Skip .obsidian and all other dotfiles/dot-directories (mirrors fs-adapter)
    if (entry.name.startsWith(".")) continue;

    const full = path.join(dir, entry.name);
    const rel = path.relative(rootDir, full).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      const children = await walkStat(full, rootDir);
      out.push(...children);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      // stat for size + mtime only — NO readFile (FP-03)
      const st = await fs.stat(full);
      out.push(`${rel}:${st.size}:${st.mtimeMs}`);
    }
    // Non-.md files silently skipped
  }

  return out;
}

/**
 * Sorts lines for determinism regardless of filesystem enumeration order,
 * joins with "\n", and returns the first 16 hex chars of a SHA-256 digest.
 * Empty input → deterministic hash of "" (stable, no throw).
 */
function hash(lines: string[]): string {
  const joined = lines.slice().sort().join("\n");
  return crypto.createHash("sha256").update(joined).digest("hex").slice(0, 16);
}

/**
 * Compute a fingerprint for any directory.
 * Exported primarily to allow tmpdir-based testing without process.cwd() binding.
 */
export async function fingerprintDir(dir: string): Promise<string> {
  return hash(await walkStat(dir, dir));
}

// ---- Per-area fingerprint functions used by repository.ts ----

/**
 * Fingerprint for the content/posts directory.
 * Changes whenever any .md file under content/posts is added, edited, or deleted.
 */
export async function postsFingerprint(): Promise<string> {
  return fingerprintDir(path.join(process.cwd(), "content", "posts"));
}

/**
 * Fingerprint for the content/pages directory.
 * Changes whenever any .md file under content/pages is added, edited, or deleted.
 */
export async function pagesFingerprint(): Promise<string> {
  return fingerprintDir(path.join(process.cwd(), "content", "pages"));
}

/**
 * Fingerprint for config/site.yaml (single-file stat).
 * Missing file → stable empty fingerprint (no throw).
 */
export async function siteConfigFingerprint(): Promise<string> {
  const configPath = path.join(process.cwd(), "config", "site.yaml");
  try {
    const st = await fs.stat(configPath);
    return hash([`site.yaml:${st.size}:${st.mtimeMs}`]);
  } catch {
    // Missing config → stable empty fp (ADR-G)
    return hash([]);
  }
}

/**
 * Fingerprint for config/taxonomies.yaml (single-file stat).
 * Missing file → stable empty fingerprint (no throw).
 */
export async function taxonomiesFingerprint(): Promise<string> {
  const configPath = path.join(process.cwd(), "config", "taxonomies.yaml");
  try {
    const st = await fs.stat(configPath);
    return hash([`taxonomies.yaml:${st.size}:${st.mtimeMs}`]);
  } catch {
    // Missing config → stable empty fp (ADR-G)
    return hash([]);
  }
}
