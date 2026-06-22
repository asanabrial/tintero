import { describe, expect, test, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { loadRedirects } from "@/lib/seo/redirect-store";

const tmpFiles: string[] = [];

async function writeTmp(content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-redirects-"));
  const file = path.join(dir, "redirects.yaml");
  await fs.writeFile(file, content, "utf-8");
  tmpFiles.push(dir);
  return file;
}

afterEach(async () => {
  await Promise.all(tmpFiles.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("loadRedirects", () => {
  test("parses a bare list of rules", async () => {
    const file = await writeTmp(
      "- from: /old\n  to: /blog/new\n  permanent: true\n- from: /b\n  to: /c\n"
    );
    const rules = await loadRedirects(file);
    expect(rules).toEqual([
      { from: "/old", to: "/blog/new", permanent: true },
      { from: "/b", to: "/c", permanent: false },
    ]);
  });

  test("parses rules nested under a redirects: key", async () => {
    const file = await writeTmp("redirects:\n  - from: /x\n    to: /y\n");
    const rules = await loadRedirects(file);
    expect(rules).toEqual([{ from: "/x", to: "/y", permanent: false }]);
  });

  test("skips entries missing from/to", async () => {
    const file = await writeTmp("- from: /only-from\n- to: /only-to\n- from: /a\n  to: /b\n");
    const rules = await loadRedirects(file);
    expect(rules).toEqual([{ from: "/a", to: "/b", permanent: false }]);
  });

  test("missing file yields an empty list (never throws)", async () => {
    expect(await loadRedirects("/no/such/redirects.yaml")).toEqual([]);
  });
});
