// Server-only reader for the redirect rules stored in config/redirects.yaml.
// NEVER import this into a client bundle (it uses node:fs).
//
// File shape (either a bare list or under a `redirects:` key):
//   - { from: "/old", to: "/blog/new", permanent: true }

import * as fs from "fs/promises";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import type { RedirectRule } from "./redirects";

function coerceRules(data: unknown): RedirectRule[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { redirects?: unknown }).redirects)
      ? (data as { redirects: unknown[] }).redirects
      : [];
  return list.flatMap((raw): RedirectRule[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const from = typeof r.from === "string" ? r.from.trim() : "";
    const to = typeof r.to === "string" ? r.to.trim() : "";
    if (!from || !to) return [];
    return [{ from, to, permanent: r.permanent === true }];
  });
}

/**
 * Load redirect rules from config/redirects.yaml. Missing/invalid files yield an
 * empty list (redirects are best-effort and must never break a page render).
 */
export async function loadRedirects(configPath?: string): Promise<RedirectRule[]> {
  const resolvedPath = configPath ?? path.join(process.cwd(), "config", "redirects.yaml");
  let raw: string;
  try {
    raw = await fs.readFile(resolvedPath, "utf-8");
  } catch {
    return [];
  }
  try {
    return coerceRules(parseYaml(raw));
  } catch {
    return [];
  }
}
