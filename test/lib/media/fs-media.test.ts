import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeUpload,
  deleteUpload,
  listUploads,
} from "../../../src/lib/media/fs-media";
import { MAX_BYTES } from "../../../src/lib/media/allowlist";

// ============================================================
// Helpers
// ============================================================

/** Create an in-memory File object for testing. */
function makeFile(content: Uint8Array | string, name: string, type: string): File {
  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  // Slice to a plain ArrayBuffer to satisfy BlobPart type constraints
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([buffer], name, { type });
}

function makeBytes(size: number): Uint8Array {
  return new Uint8Array(size).fill(0x41); // fill with 'A'
}

// UUID v4 pattern
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ============================================================
// Test lifecycle: create + teardown temp dir per test
// ============================================================
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-media-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================
// writeUpload — happy path
// ============================================================
describe("writeUpload happy path", () => {
  test("returns ok:true with asset matching UUID pattern", async () => {
    const bytes = makeBytes(100);
    const file = makeFile(bytes, "photo.png", "image/png");
    const result = await writeUpload(tmpDir, file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { filename, size, url } = result.asset;

    // Filename must be UUID-prefixed
    const uuidPart = filename.slice(0, 36);
    expect(uuidPart).toMatch(UUID_PATTERN);
    // Tail after UUID + '-' is the sanitized name
    const tail = filename.slice(37);
    expect(tail).toBe("photo.png");

    // Size equals the original byte count
    expect(size).toBe(bytes.length);

    // URL is the public path
    expect(url).toBe(`/uploads/${filename}`);

    // File exists on disk with correct content
    const diskContent = await fs.readFile(path.join(tmpDir, filename));
    expect(diskContent).toEqual(Buffer.from(bytes));
  });

  test("atomic cleanup: no .tmp leftover after successful write", async () => {
    const file = makeFile(makeBytes(50), "clean.jpg", "image/jpeg");
    const result = await writeUpload(tmpDir, file);
    expect(result.ok).toBe(true);

    const entries = await fs.readdir(tmpDir);
    // No file starting with '.'
    const dotFiles = entries.filter((e) => e.startsWith("."));
    expect(dotFiles).toHaveLength(0);
    // Exactly one file written
    expect(entries).toHaveLength(1);
  });
});

// ============================================================
// writeUpload — rejection paths
// ============================================================
describe("writeUpload rejections", () => {
  test("oversized file (> MAX_BYTES) returns too_large, no file written", async () => {
    const bytes = makeBytes(MAX_BYTES + 1);
    const file = makeFile(bytes, "big.png", "image/png");
    const result = await writeUpload(tmpDir, file);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("too_large");

    const entries = await fs.readdir(tmpDir);
    expect(entries).toHaveLength(0);
  });

  test("disallowed extension (.svg) returns invalid_extension, no file written", async () => {
    const file = makeFile(makeBytes(100), "icon.svg", "image/svg+xml");
    const result = await writeUpload(tmpDir, file);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_extension");

    const entries = await fs.readdir(tmpDir);
    expect(entries).toHaveLength(0);
  });

  test("mismatched MIME (x.png with text/html) returns invalid_mime, no file written", async () => {
    const file = makeFile(makeBytes(100), "photo.png", "text/html");
    const result = await writeUpload(tmpDir, file);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_mime");

    const entries = await fs.readdir(tmpDir);
    expect(entries).toHaveLength(0);
  });

  test("empty file (0 bytes) returns no_file, no file written", async () => {
    const file = makeFile(new Uint8Array(0), "empty.png", "image/png");
    const result = await writeUpload(tmpDir, file);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("no_file");

    const entries = await fs.readdir(tmpDir);
    expect(entries).toHaveLength(0);
  });
});

// ============================================================
// deleteUpload
// ============================================================
describe("deleteUpload", () => {
  test("happy path: write then delete removes file", async () => {
    const file = makeFile(makeBytes(50), "todelete.png", "image/png");
    const writeResult = await writeUpload(tmpDir, file);
    expect(writeResult.ok).toBe(true);
    if (!writeResult.ok) return;

    const { filename } = writeResult.asset;
    const deleteResult = await deleteUpload(tmpDir, filename);
    expect(deleteResult.ok).toBe(true);

    // File should be gone
    const entries = await fs.readdir(tmpDir);
    expect(entries).not.toContain(filename);
  });

  test("ENOENT tolerance: deleting non-existent file returns ok:true", async () => {
    const result = await deleteUpload(tmpDir, "does-not-exist.png");
    expect(result.ok).toBe(true);
  });

  test("traversal reject: ../outside.png returns ok:false with invalid_filename, outside file untouched", async () => {
    // Create a real file outside tmpDir that traversal would target
    const outsidePath = path.join(tmpDir, "..", "outside-target.png");
    await fs.writeFile(outsidePath, "sensitive");

    const result = await deleteUpload(tmpDir, "../outside-target.png");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_filename");

    // The outside file must still exist (was NOT deleted)
    const stillExists = await fs.readFile(outsidePath, "utf-8");
    expect(stillExists).toBe("sensitive");

    // Cleanup outside file
    await fs.unlink(outsidePath).catch(() => {});
  });
});

// ============================================================
// listUploads
// ============================================================
describe("listUploads", () => {
  test("returns assets sorted newest-first by mtime", async () => {
    // Write 3 files and set explicit mtimes to force ordering
    const file1 = makeFile(makeBytes(10), "first.png", "image/png");
    const file2 = makeFile(makeBytes(20), "second.jpg", "image/jpeg");
    const file3 = makeFile(makeBytes(30), "third.webp", "image/webp");

    const r1 = await writeUpload(tmpDir, file1);
    const r2 = await writeUpload(tmpDir, file2);
    const r3 = await writeUpload(tmpDir, file3);

    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    if (!r1.ok || !r2.ok || !r3.ok) return;

    // Set mtimes: file3 is newest, file1 is oldest
    const now = Date.now() / 1000; // seconds
    await fs.utimes(path.join(tmpDir, r1.asset.filename), now - 20, now - 20);
    await fs.utimes(path.join(tmpDir, r2.asset.filename), now - 10, now - 10);
    await fs.utimes(path.join(tmpDir, r3.asset.filename), now, now);

    const assets = await listUploads(tmpDir);

    // Should have exactly 3 assets (no dotfiles)
    expect(assets).toHaveLength(3);

    // Sorted newest-first: r3 (mtime=now), r2 (now-10), r1 (now-20)
    expect(assets[0].filename).toBe(r3.asset.filename);
    expect(assets[1].filename).toBe(r2.asset.filename);
    expect(assets[2].filename).toBe(r1.asset.filename);
  });

  test("dotfiles (.gitkeep, .x.tmp) are excluded from listing", async () => {
    // Create real dotfiles in tmp dir
    await fs.writeFile(path.join(tmpDir, ".gitkeep"), "");
    await fs.writeFile(path.join(tmpDir, ".x.tmp"), "temp");

    const assets = await listUploads(tmpDir);
    expect(assets).toHaveLength(0);

    // None of the returned assets are dotfiles
    for (const asset of assets) {
      expect(asset.filename).not.toMatch(/^\./);
    }
  });

  test("non-existent directory returns empty array", async () => {
    const missing = path.join(tmpDir, "nonexistent-dir-xyz");
    const assets = await listUploads(missing);
    expect(assets).toEqual([]);
  });

  test("each asset has correct url shape", async () => {
    const file = makeFile(makeBytes(50), "urlcheck.gif", "image/gif");
    const result = await writeUpload(tmpDir, file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const assets = await listUploads(tmpDir);
    expect(assets).toHaveLength(1);
    expect(assets[0].url).toBe(`/uploads/${assets[0].filename}`);
  });
});
