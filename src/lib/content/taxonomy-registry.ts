// taxonomy-registry.ts
// Pure module: read/parse config/taxonomies.yaml and merge with derived indexes.
// NO imports from 'next/cache' or 'next/headers' — cache invalidation is the action layer's job.

import * as fs from "fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { slugifyCategory, joinSlug } from "./category";
import { slugifyTag } from "./tag";
import type { Category, Tag } from "./types";

// ============================================================
// Schema
// ============================================================

const RegistryTermSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
});

export const TaxonomyRegistrySchema = z.object({
  categories: z.array(RegistryTermSchema).catch([]),
  tags: z.array(RegistryTermSchema).catch([]),
});

export type TaxonomyRegistry = z.infer<typeof TaxonomyRegistrySchema>;
export type RegistryTerm = z.infer<typeof RegistryTermSchema>;

// ============================================================
// loadTaxonomyRegistry
// ============================================================

/**
 * Load and validate a taxonomies.yaml file.
 * - Missing file → returns {categories:[], tags:[]} (no throw)
 * - Malformed YAML → returns {categories:[], tags:[]} (no throw)
 * - Bad block (e.g. categories is not an array) → that block falls back to []
 *   thanks to .catch([]) on the schema.
 */
export async function loadTaxonomyRegistry(filePath: string): Promise<TaxonomyRegistry> {
  let rawContent: string;
  try {
    rawContent = await fs.readFile(filePath, "utf-8");
  } catch {
    return { categories: [], tags: [] };
  }

  let rawData: unknown;
  try {
    rawData = parseYaml(rawContent);
  } catch {
    return { categories: [], tags: [] };
  }

  return TaxonomyRegistrySchema.parse(rawData ?? {});
}

// ============================================================
// mergeCategoryIndex
// ============================================================

/**
 * Merge a derived category index with registered taxonomy terms.
 *
 * Behavior:
 * - Derived-only entries pass through unchanged.
 * - Registered-only terms are appended with count 0; segments/depth are derived
 *   from the label via slugifyCategory.
 * - When a registered term's derived slug matches a derived entry, the derived
 *   count is preserved and the description (if any) is attached.
 * - Deduplication by slug: only one entry per slug in output.
 * - Output is sorted alphabetically by slug (matches buildCategoryIndex behavior).
 */
export function mergeCategoryIndex(
  derived: Category[],
  registered: TaxonomyRegistry["categories"]
): Category[] {
  // Build a mutable map from derived entries keyed by slug
  const bySlug = new Map<string, Category>(
    derived.map((c) => [c.slug, { ...c }])
  );

  for (const term of registered) {
    const segments = slugifyCategory(term.label);
    if (segments.length === 0) continue;
    const slug = joinSlug(segments);

    if (bySlug.has(slug)) {
      // Overlap: preserve derived entry; attach description if provided
      const existing = bySlug.get(slug)!;
      if (term.description !== undefined) {
        existing.description = term.description;
      }
    } else {
      // Registered-only: create new entry with count 0
      const label =
        term.label
          .split("/")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .pop() ?? term.label.trim();

      const entry: Category = {
        segments,
        slug,
        label,
        count: 0,
        depth: segments.length,
        ...(term.description !== undefined ? { description: term.description } : {}),
      };
      bySlug.set(slug, entry);
    }
  }

  const result = Array.from(bySlug.values());
  result.sort((a, b) => a.slug.localeCompare(b.slug));
  return result;
}

// ============================================================
// mergeTagIndex
// ============================================================

/**
 * Merge a derived tag index with registered taxonomy terms.
 *
 * Behavior:
 * - Derived-only entries pass through unchanged (original ordering preserved).
 * - Registered-only terms are appended at the end with count 0.
 * - When a registered term's derived slug matches a derived entry, the derived
 *   count is preserved and the description (if any) is attached.
 * - Deduplication by slug: only one entry per slug in output.
 */
export function mergeTagIndex(
  derived: Tag[],
  registered: TaxonomyRegistry["tags"]
): Tag[] {
  // Mutable copy of derived entries, keyed by slug for fast lookup
  const derivedBySlug = new Map<string, Tag>(
    derived.map((t) => [t.slug, { ...t }])
  );
  // Track insertion order (derived first, then registered-only appended)
  const orderedSlugs: string[] = derived.map((t) => t.slug);

  for (const term of registered) {
    const slug = slugifyTag(term.label);
    if (!slug) continue;

    if (derivedBySlug.has(slug)) {
      // Overlap: attach description if provided, keep derived count
      const existing = derivedBySlug.get(slug)!;
      if (term.description !== undefined) {
        existing.description = term.description;
      }
    } else {
      // Registered-only: append with count 0
      const entry: Tag = {
        slug,
        label: term.label.trim(),
        count: 0,
        ...(term.description !== undefined ? { description: term.description } : {}),
      };
      derivedBySlug.set(slug, entry);
      orderedSlugs.push(slug);
    }
  }

  return orderedSlugs.map((slug) => derivedBySlug.get(slug)!);
}
