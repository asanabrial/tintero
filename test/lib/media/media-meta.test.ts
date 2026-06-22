import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  getMediaMeta,
  setMediaMeta,
  deleteMediaMeta,
} from "../../../src/lib/media/media-meta";

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-meta-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const FILE = "uuid-photo.png";
const sidecarPath = (dir: string, f: string) => path.join(dir, "." + f + ".meta.json");

describe("getMediaMeta", () => {
  test("no sidecar -> {}", async () => {
    expect(await getMediaMeta(tmpDir, FILE)).toEqual({});
  });
  test("malformed JSON -> {}", async () => {
    await fs.writeFile(sidecarPath(tmpDir, FILE), "{not json");
    expect(await getMediaMeta(tmpDir, FILE)).toEqual({});
  });
});

describe("setMediaMeta round-trip", () => {
  test("set then get returns the stored meta", async () => {
    await setMediaMeta(tmpDir, FILE, { alt: "A cat", caption: "My cat" });
    expect(await getMediaMeta(tmpDir, FILE)).toEqual({ alt: "A cat", caption: "My cat" });
  });
  test("partial meta (alt only) round-trips, omits caption", async () => {
    await setMediaMeta(tmpDir, FILE, { alt: "only alt" });
    expect(await getMediaMeta(tmpDir, FILE)).toEqual({ alt: "only alt" });
  });
  test("sidecar uses .{filename}.meta.json naming", async () => {
    await setMediaMeta(tmpDir, FILE, { alt: "x" });
    const entries = await fs.readdir(tmpDir);
    expect(entries).toContain("." + FILE + ".meta.json");
  });
  test("no .tmp leftover after write", async () => {
    await setMediaMeta(tmpDir, FILE, { alt: "x" });
    const entries = await fs.readdir(tmpDir);
    expect(entries.filter((e) => e.endsWith(".tmp"))).toHaveLength(0);
  });
});

describe("setMediaMeta empty -> deletes / no file", () => {
  test("empty meta writes no sidecar", async () => {
    await setMediaMeta(tmpDir, FILE, {});
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });
  test("whitespace-only meta writes no sidecar", async () => {
    await setMediaMeta(tmpDir, FILE, { alt: "   ", caption: "" });
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });
  test("setting empty after a value removes the existing sidecar", async () => {
    await setMediaMeta(tmpDir, FILE, { alt: "x" });
    await setMediaMeta(tmpDir, FILE, {});
    expect(await getMediaMeta(tmpDir, FILE)).toEqual({});
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });
});

describe("deleteMediaMeta", () => {
  test("ENOENT tolerated (no sidecar) resolves", async () => {
    await expect(deleteMediaMeta(tmpDir, FILE)).resolves.toBeUndefined();
  });
  test("removes an existing sidecar", async () => {
    await setMediaMeta(tmpDir, FILE, { alt: "x" });
    await deleteMediaMeta(tmpDir, FILE);
    expect(await getMediaMeta(tmpDir, FILE)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Traversal safety
// Asserts that getMediaMeta/setMediaMeta/deleteMediaMeta with "../"-style or
// absolute-path filenames have NO filesystem effect outside the uploads dir.
// ---------------------------------------------------------------------------
describe("traversal safety", () => {
  // getMediaMeta with traversal filenames must silently return {}
  test("getMediaMeta('../etc/passwd') returns {} — no read outside dir", async () => {
    expect(await getMediaMeta(tmpDir, "../etc/passwd")).toEqual({});
  });

  test("getMediaMeta('../../secret.json') returns {} — no read outside dir", async () => {
    expect(await getMediaMeta(tmpDir, "../../secret.json")).toEqual({});
  });

  // setMediaMeta with a traversal filename must be a no-op:
  // no file may be created outside the uploads dir.
  // We set up a parent dir containing the uploads subdir; after the call
  // the parent dir's own entry list must be unchanged.
  test("setMediaMeta('../escape', ...) creates no file outside uploads dir", async () => {
    // tmpDir is already a fresh temp dir per beforeEach — treat it as the parent.
    const uploadsDir = path.join(tmpDir, "uploads");
    await fs.mkdir(uploadsDir);

    // Snapshot parent entries before the call.
    const before = await fs.readdir(tmpDir);

    await setMediaMeta(uploadsDir, "../pwned", { alt: "x" });

    // Parent dir entries must be identical (no ".pwned.meta.json" or similar).
    const after = await fs.readdir(tmpDir);
    expect(after.sort()).toEqual(before.sort());
  });

  // deleteMediaMeta with a traversal filename must be a no-op and not throw.
  // A sentinel sidecar planted in the parent must survive the call.
  test("deleteMediaMeta('../target') does not delete a file outside uploads dir", async () => {
    const uploadsDir = path.join(tmpDir, "uploads");
    await fs.mkdir(uploadsDir);

    // Plant a sentinel at the location a traversal could target.
    const sentinel = path.join(tmpDir, ".target.meta.json");
    await fs.writeFile(sentinel, "{}", "utf-8");

    // Must not throw and must leave the sentinel intact.
    await expect(deleteMediaMeta(uploadsDir, "../target")).resolves.toBeUndefined();
    // fs.access resolves (without throwing) when the file exists.
    await expect(fs.access(sentinel)).resolves.toBeDefined();
  });

  // Backslash-based traversal (Windows) must also be safe.
  test("getMediaMeta with backslash traversal returns {}", async () => {
    expect(await getMediaMeta(tmpDir, "..\\windows\\secret")).toEqual({});
  });

  // Absolute path as filename must be safe.
  test("getMediaMeta with absolute path filename returns {}", async () => {
    // Use a path that definitely does not exist inside tmpDir.
    expect(await getMediaMeta(tmpDir, "/etc/passwd")).toEqual({});
  });

  test("setMediaMeta with absolute path filename is a no-op (no file created outside dir)", async () => {
    const uploadsDir = path.join(tmpDir, "uploads");
    await fs.mkdir(uploadsDir);

    const before = await fs.readdir(tmpDir);

    await setMediaMeta(uploadsDir, "/tmp/injected", { alt: "x" });

    const after = await fs.readdir(tmpDir);
    expect(after.sort()).toEqual(before.sort());
  });
});
