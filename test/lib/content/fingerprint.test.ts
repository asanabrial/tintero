import { describe, expect, test, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fingerprintDir } from "../../../src/lib/content/fingerprint";

// Each test gets a fresh tmpdir; cleaned up in afterEach.
let tmpDir: string | null = null;

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fp-test-"));
  tmpDir = dir;
  return dir;
}

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("fingerprintDir", () => {
  test("FP-01: same files → same fingerprint (two calls equal)", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, "a.md"), "hello world");
    await fs.writeFile(path.join(dir, "b.md"), "goodbye world");

    const fp1 = await fingerprintDir(dir);
    const fp2 = await fingerprintDir(dir);

    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(16);
  });

  test("FP-02: add a .md → fingerprint changes", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, "a.md"), "hello world");

    const before = await fingerprintDir(dir);
    await fs.writeFile(path.join(dir, "new.md"), "brand new file");
    const after = await fingerprintDir(dir);

    expect(after).not.toBe(before);
  });

  test("FP-02: edit a file (change content/size) → fingerprint changes", async () => {
    const dir = await makeTmpDir();
    const filePath = path.join(dir, "a.md");
    await fs.writeFile(filePath, "original content");

    const before = await fingerprintDir(dir);
    // Rewrite with longer content (changes size → definitely changes fingerprint)
    await fs.writeFile(filePath, "original content extended with more bytes to guarantee size change");
    const after = await fingerprintDir(dir);

    expect(after).not.toBe(before);
  });

  test("FP-02: delete a .md → fingerprint changes", async () => {
    const dir = await makeTmpDir();
    const fileA = path.join(dir, "a.md");
    const fileB = path.join(dir, "b.md");
    await fs.writeFile(fileA, "first");
    await fs.writeFile(fileB, "second");

    const before = await fingerprintDir(dir);
    await fs.unlink(fileB);
    const after = await fingerprintDir(dir);

    expect(after).not.toBe(before);
  });

  test("FP-03: missing dir → stable empty fingerprint (no throw)", async () => {
    const nonExistent = path.join(os.tmpdir(), `fp-missing-${Date.now()}`);

    let threw = false;
    let fp1: string | undefined;
    let fp2: string | undefined;
    try {
      fp1 = await fingerprintDir(nonExistent);
      fp2 = await fingerprintDir(nonExistent);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(fp1).toBeDefined();
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(16);
  });

  test("FP-04: nested subdir .md files are included", async () => {
    const dir = await makeTmpDir();
    const subDir = path.join(dir, "sub");
    await fs.mkdir(subDir);
    await fs.writeFile(path.join(dir, "root.md"), "root");

    const before = await fingerprintDir(dir);

    await fs.writeFile(path.join(subDir, "nested.md"), "nested");
    const after = await fingerprintDir(dir);

    expect(after).not.toBe(before);
  });

  test("FP-04: dotfiles and .obsidian dir are excluded", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, "visible.md"), "visible content");

    const before = await fingerprintDir(dir);

    // Add dotfile — should NOT change fingerprint
    await fs.writeFile(path.join(dir, ".hidden.md"), "hidden content");
    const afterDotfile = await fingerprintDir(dir);
    expect(afterDotfile).toBe(before);

    // Add .obsidian dir with a .md inside — should NOT change fingerprint
    const obsidianDir = path.join(dir, ".obsidian");
    await fs.mkdir(obsidianDir);
    await fs.writeFile(path.join(obsidianDir, "config.md"), "obsidian config");
    const afterObsidian = await fingerprintDir(dir);
    expect(afterObsidian).toBe(before);
  });

  test("FP-04: non-.md files are ignored", async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, "post.md"), "markdown content");

    const before = await fingerprintDir(dir);

    // Adding a non-.md file should NOT change the fingerprint
    await fs.writeFile(path.join(dir, "image.png"), "png binary data");
    await fs.writeFile(path.join(dir, "data.json"), '{"key":"value"}');
    const after = await fingerprintDir(dir);

    expect(after).toBe(before);
  });

  test("FP-04: sort determinism — two calls over same dir always equal", async () => {
    const dir = await makeTmpDir();
    // Create multiple files to exercise the sort path
    await fs.writeFile(path.join(dir, "zebra.md"), "z content");
    await fs.writeFile(path.join(dir, "alpha.md"), "a content");
    await fs.writeFile(path.join(dir, "middle.md"), "m content");

    const fp1 = await fingerprintDir(dir);
    const fp2 = await fingerprintDir(dir);

    expect(fp1).toBe(fp2);
  });
});

// Cross-area isolation tests: two separate dirs (simulating content/posts vs content/pages).
// Proves that editing files in one area does NOT bust the fingerprint of the other area.
// This is the per-area-isolation guarantee from ADR-A.
describe("fingerprintDir — cross-area isolation", () => {
  // Two independent tmpdirs cleaned up after each test.
  let dirA: string | null = null;
  let dirB: string | null = null;

  afterEach(async () => {
    if (dirA) {
      await fs.rm(dirA, { recursive: true, force: true });
      dirA = null;
    }
    if (dirB) {
      await fs.rm(dirB, { recursive: true, force: true });
      dirB = null;
    }
  });

  async function makeTwoDirs(): Promise<[string, string]> {
    dirA = await fs.mkdtemp(path.join(os.tmpdir(), "fp-area-a-"));
    dirB = await fs.mkdtemp(path.join(os.tmpdir(), "fp-area-b-"));
    return [dirA, dirB];
  }

  test("ISO-01: two separate dirs with different files have different fingerprints", async () => {
    const [a, b] = await makeTwoDirs();
    await fs.writeFile(path.join(a, "post1.md"), "posts content");
    await fs.writeFile(path.join(b, "page1.md"), "pages content");

    const fpA = await fingerprintDir(a);
    const fpB = await fingerprintDir(b);

    // Different dirs with different content must differ
    expect(fpA).not.toBe(fpB);
    expect(fpA).toHaveLength(16);
    expect(fpB).toHaveLength(16);
  });

  test("ISO-02: adding a file in B does NOT change fingerprintDir(A)", async () => {
    const [a, b] = await makeTwoDirs();
    await fs.writeFile(path.join(a, "post1.md"), "posts area");
    await fs.writeFile(path.join(b, "page1.md"), "pages area");

    const fpABefore = await fingerprintDir(a);
    const fpBBefore = await fingerprintDir(b);

    // Mutate B: add a new file
    await fs.writeFile(path.join(b, "page2.md"), "new page");
    const fpBAfter = await fingerprintDir(b);
    const fpAAfter = await fingerprintDir(a);

    // B's fingerprint changed after mutation (proves the mutation was effective)
    expect(fpBAfter).not.toBe(fpBBefore);
    // A is stable — the change in B must NOT propagate to A
    expect(fpAAfter).toBe(fpABefore);
  });

  test("ISO-03: editing a file in B does NOT change fingerprintDir(A)", async () => {
    const [a, b] = await makeTwoDirs();
    await fs.writeFile(path.join(a, "post1.md"), "posts content");
    const bFile = path.join(b, "page1.md");
    await fs.writeFile(bFile, "original pages content");

    const fpABefore = await fingerprintDir(a);

    // Mutate B: edit existing file (change size to guarantee fp change in B)
    await fs.writeFile(bFile, "original pages content extended with more bytes to ensure size change");
    const fpAAfter = await fingerprintDir(a);

    expect(fpAAfter).toBe(fpABefore);
  });

  test("ISO-04: deleting a file in B does NOT change fingerprintDir(A)", async () => {
    const [a, b] = await makeTwoDirs();
    await fs.writeFile(path.join(a, "post1.md"), "posts content");
    const bFile = path.join(b, "page1.md");
    await fs.writeFile(bFile, "pages content");
    await fs.writeFile(path.join(b, "page2.md"), "second page");

    const fpABefore = await fingerprintDir(a);

    // Mutate B: delete a file
    await fs.unlink(bFile);
    const fpAAfter = await fingerprintDir(a);

    expect(fpAAfter).toBe(fpABefore);
  });

  test("ISO-05: adding a file in A does NOT change fingerprintDir(B)", async () => {
    const [a, b] = await makeTwoDirs();
    await fs.writeFile(path.join(a, "post1.md"), "posts area");
    await fs.writeFile(path.join(b, "page1.md"), "pages area");

    const fpBBefore = await fingerprintDir(b);

    // Mutate A: add a new post
    await fs.writeFile(path.join(a, "post2.md"), "second post");
    const fpBAfter = await fingerprintDir(b);

    expect(fpBAfter).toBe(fpBBefore);
  });

  test("ISO-06: editing a file in A does NOT change fingerprintDir(B)", async () => {
    const [a, b] = await makeTwoDirs();
    const aFile = path.join(a, "post1.md");
    await fs.writeFile(aFile, "original post");
    await fs.writeFile(path.join(b, "page1.md"), "pages content");

    const fpBBefore = await fingerprintDir(b);

    // Mutate A: edit existing file
    await fs.writeFile(aFile, "original post extended with more bytes to ensure size change");
    const fpBAfter = await fingerprintDir(b);

    expect(fpBAfter).toBe(fpBBefore);
  });
});
