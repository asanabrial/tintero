import * as fs from "fs/promises";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { CommentsConfigSchema, ReadingConfigSchema, SiteConfigSchema } from "./schema";
import type { SiteConfig } from "./types";

/**
 * Load and validate config/site.yaml.
 * - Unknown keys trigger a console.warn (not an error).
 * - If the file is missing, falls back to schema defaults with a warning.
 * - Never throws.
 */
export async function loadSiteConfig(configPath?: string): Promise<SiteConfig> {
  // Note: Turbopack NFT warning "Encountered unexpected file in NFT list" on build
  // is a benign static-analysis artifact caused by this path.join call. The
  // turbopackIgnore comment only applies to dynamic import()/require() calls —
  // it cannot silence file-trace warnings from fs.readFile paths. This is a
  // known Turbopack limitation; the warning does not affect production behavior.
  const resolvedPath =
    configPath ??
    path.join(process.cwd(), "config", "site.yaml");

  let rawContent: string;
  try {
    rawContent = await fs.readFile(resolvedPath, "utf-8");
  } catch {
    console.warn(
      `[blog] site.yaml not found at "${resolvedPath}", using schema defaults.`
    );
    return SiteConfigSchema.parse({});
  }

  let rawData: Record<string, unknown>;
  try {
    rawData = parseYaml(rawContent) as Record<string, unknown>;
  } catch (err) {
    console.warn(`[blog] Failed to parse site.yaml: ${String(err)}, using defaults.`);
    return SiteConfigSchema.parse({});
  }

  // Detect unknown keys before stripping them. Derive the known-key set directly
  // from the schema shape so it can never drift out of sync with SiteConfigSchema
  // (a hand-maintained list previously omitted timezone, dateFormat, and footerNav,
  // producing false "unknown key — will be ignored" warnings for valid config).
  const knownKeys = new Set(Object.keys(SiteConfigSchema.shape));
  for (const key of Object.keys(rawData)) {
    if (!knownKeys.has(key)) {
      console.warn(
        `[blog] site.yaml contains unknown key "${key}" — it will be ignored.`
      );
    }
  }

  // R3 isolation: parse reading and comments blocks separately so a bad sub-block
  // only resets that block to defaults — never the rest of the config.
  const { reading: rawReading, comments: rawComments, ...rawRest } = rawData;

  const baseResult = SiteConfigSchema.safeParse(rawRest);
  const base = baseResult.success
    ? baseResult.data
    : (() => {
        console.warn(
          `[blog] site.yaml validation failed: ${baseResult.error.message}, using defaults for invalid fields.`
        );
        return SiteConfigSchema.parse({});
      })();

  const readingResult = ReadingConfigSchema.safeParse(
    rawReading !== undefined ? rawReading : {}
  );
  const reading = readingResult.success
    ? readingResult.data
    : (() => {
        const issues = readingResult.error.issues
          .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
          .join("; ");
        console.warn(
          `[blog] invalid reading settings: ${issues}, falling back to defaults (hero-recent, posts_per_page=10).`
        );
        return ReadingConfigSchema.parse({});
      })();

  const commentsResult = CommentsConfigSchema.safeParse(
    rawComments !== undefined ? rawComments : null
  );
  const comments = commentsResult.success
    ? commentsResult.data
    : (() => {
        const issues = commentsResult.error.issues
          .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
          .join("; ");
        console.warn(
          `[blog] invalid comments settings: ${issues}, falling back to defaults (enabled=true, moderation=manual).`
        );
        return CommentsConfigSchema.parse(null);
      })();

  return { ...base, reading, comments } as SiteConfig;
}
