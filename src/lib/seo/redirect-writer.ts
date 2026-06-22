// Server-only writer for config/redirects.yaml. NEVER import into a client bundle.
// Atomic write (tmp + rename), mirroring the site-config writer pattern.

import * as fs from "fs/promises";
import * as path from "path";
import { stringify as yamlStringify } from "yaml";
import { normalizePath, type RedirectRule } from "./redirects";
import { loadRedirects } from "./redirect-store";

function redirectsPath(): string {
  return path.join(process.cwd(), "config", "redirects.yaml");
}

/** Serialize and atomically write the full rule list. */
export async function writeRedirects(rules: RedirectRule[]): Promise<void> {
  const file = redirectsPath();
  const dir = path.dirname(file);
  const tmp = path.join(dir, ".redirects.yaml.tmp");
  const yaml = yamlStringify(
    rules.map((r) => ({ from: r.from, to: r.to, ...(r.permanent ? { permanent: true } : {}) }))
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmp, yaml, "utf-8");
  await fs.rename(tmp, file);
}

/** Add a rule (replacing any existing rule with the same source path). */
export async function addRedirect(rule: RedirectRule): Promise<void> {
  const rules = await loadRedirects();
  const kept = rules.filter((r) => normalizePath(r.from) !== normalizePath(rule.from));
  await writeRedirects([...kept, rule]);
}

/** Remove the rule whose source matches `from` (normalized). */
export async function removeRedirect(from: string): Promise<void> {
  const rules = await loadRedirects();
  await writeRedirects(rules.filter((r) => normalizePath(r.from) !== normalizePath(from)));
}
