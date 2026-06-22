import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { loadWidgetsConfig } from "./widgets-config";
import type { Widget } from "./types";

// MUST NOT contain 'use cache' at module level — this IS the cache key computation.
async function widgetsConfigFingerprint(): Promise<string> {
  const configPath = path.join(process.cwd(), "config", "widgets.yaml");
  try {
    const st = await fs.stat(configPath);
    const joined = `widgets.yaml:${st.size}:${st.mtimeMs}`;
    return crypto.createHash("sha256").update(joined).digest("hex").slice(0, 16);
  } catch {
    return crypto.createHash("sha256").update("").digest("hex").slice(0, 16);
  }
}

async function cachedLoadWidgets(
  _fp: string
): Promise<{ "blog-sidebar": Widget[] }> {
  "use cache";
  cacheLife("max");
  cacheTag("widgets");
  return loadWidgetsConfig();
}

export async function getWidgets(): Promise<{ "blog-sidebar": Widget[] }> {
  const fp = await widgetsConfigFingerprint();
  return cachedLoadWidgets(fp);
}
