// IMPORTANT: NO imports from 'next/cache' or 'next/headers'.
// Cache invalidation is the Server Action's responsibility (ADR-4).
import * as fs from "fs/promises";
import * as path from "path";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import { WidgetsConfigSchema } from "./schema";
import type { Widget } from "./types";

export class FsWidgetsConfigWriter {
  constructor(private readonly configPath: string) {}

  async writeArea(
    area: "blog-sidebar",
    widgets: Widget[]
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    // Read existing file; missing file → empty object
    let rawContent: string;
    try {
      rawContent = await fs.readFile(this.configPath, "utf-8");
    } catch {
      rawContent = "";
    }

    // Parse existing
    let existing: Record<string, unknown> = {};
    try {
      existing = (
        rawContent.trim() ? yamlParse(rawContent) : {}
      ) as Record<string, unknown>;
    } catch {
      existing = {};
    }

    // Merge: replace only the target area
    const merged: Record<string, unknown> = { ...existing, [area]: widgets };

    // Write-guard: validate before writing
    const guard = WidgetsConfigSchema.safeParse(merged);
    if (!guard.success) {
      return {
        ok: false,
        error: `Write-guard validation failed: ${guard.error.message}`,
      };
    }

    const yaml = yamlStringify(merged);
    const dir = path.dirname(this.configPath);
    const tmpPath = path.join(dir, ".widgets.yaml.tmp");

    try {
      await fs.writeFile(tmpPath, yaml, "utf-8");
      await fs.rename(tmpPath, this.configPath);
    } catch (err) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        /* ignore */
      }
      return { ok: false, error: `Write failed: ${String(err)}` };
    }

    return { ok: true };
  }
}

export function getWidgetsConfigWriter(): FsWidgetsConfigWriter {
  return new FsWidgetsConfigWriter(
    path.join(process.cwd(), "config", "widgets.yaml")
  );
}
