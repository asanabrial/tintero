import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import matter from "gray-matter";
import { FsContentWriter } from "./fs-writer";

describe("FsContentWriter — visibility", () => {
  let tmpDir: string;
  let writer: FsContentWriter;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `tintero-vis-${crypto.randomUUID()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    writer = new FsContentWriter(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("createPost with visibility private writes visibility: private in YAML, no password key", async () => {
    const result = await writer.createPost({
      title: "Private Post",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      body: "Secret content.",
      visibility: "private",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = await fs.readFile(path.join(tmpDir, `${result.slug}.md`), "utf-8");
    const { data } = matter(raw);
    expect(data.visibility).toBe("private");
    expect(data.password).toBeUndefined();
  });

  it("createPost with visibility password + password writes both keys in YAML", async () => {
    const result = await writer.createPost({
      title: "Password Post",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      body: "Protected content.",
      visibility: "password",
      password: "s3cret",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = await fs.readFile(path.join(tmpDir, `${result.slug}.md`), "utf-8");
    const { data } = matter(raw);
    expect(data.visibility).toBe("password");
    expect(data.password).toBe("s3cret");
  });

  it("createPost with visibility public (or undefined) writes NO visibility key (backward compat)", async () => {
    const result = await writer.createPost({
      title: "Public Post",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      body: "Public content.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = await fs.readFile(path.join(tmpDir, `${result.slug}.md`), "utf-8");
    const { data } = matter(raw);
    expect(data.visibility).toBeUndefined();
    expect(data.password).toBeUndefined();
  });

  it("updatePost from password to public removes both visibility and password keys", async () => {
    // First create a password-protected post
    const createResult = await writer.createPost({
      title: "Was Password",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      body: "Body.",
      visibility: "password",
      password: "oldpw",
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const slug = createResult.slug;

    // Now update to public
    const updateResult = await writer.updatePost(slug, {
      title: "Was Password",
      date: "2026-01-01",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      body: "Body.",
      visibility: "public",
    });
    expect(updateResult.ok).toBe(true);
    if (!updateResult.ok) return;
    const raw = await fs.readFile(path.join(tmpDir, `${slug}.md`), "utf-8");
    const { data } = matter(raw);
    expect(data.visibility).toBeUndefined();
    expect(data.password).toBeUndefined();
  });

  it("date still round-trips as string when visibility is set (YAML 1.1 guard)", async () => {
    const result = await writer.createPost({
      title: "Date Guard",
      date: "2026-06-18",
      status: "published",
      tags: [],
      categories: [],
      comments: true,
      body: "Body.",
      visibility: "private",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = await fs.readFile(path.join(tmpDir, `${result.slug}.md`), "utf-8");
    const { data } = matter(raw);
    expect(typeof data.date).toBe("string");
    expect(data.date).toBe("2026-06-18");
  });
});
