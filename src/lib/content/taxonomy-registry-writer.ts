// taxonomy-registry-writer.ts
// IMPORTANT: NO imports from 'next/cache' or 'next/headers'.
// Cache invalidation is the Server Action layer's responsibility (ADR-4).

import * as fs from "fs/promises";
import * as path from "path";
import { stringify as yamlStringify } from "yaml";
import { slugifyCategory, joinSlug } from "./category";
import { slugifyTag } from "./tag";
import { loadTaxonomyRegistry } from "./taxonomy-registry";
import type { TaxonomyRegistry } from "./taxonomy-registry";

// ============================================================
// Result types
// ============================================================

export type AddTermResult =
  | { ok: true }
  | { ok: false; error: { kind: "invalid_label" | "duplicate" | "write_error"; message?: string } };

export type RemoveTermResult =
  | { ok: true }
  | { ok: false; error: { kind: "write_error"; message?: string } };

// ============================================================
// FsTaxonomyRegistryWriter
// ============================================================

export class FsTaxonomyRegistryWriter {
  constructor(private readonly filePath: string) {}

  private async read(): Promise<TaxonomyRegistry> {
    return loadTaxonomyRegistry(this.filePath);
  }

  private async write(data: TaxonomyRegistry): Promise<void> {
    const dir = path.dirname(this.filePath);
    const tmpPath = path.join(dir, ".taxonomies.yaml.tmp");
    const yaml = yamlStringify(data);
    await fs.writeFile(tmpPath, yaml, "utf-8");
    await fs.rename(tmpPath, this.filePath);
  }

  /**
   * Add a new term to the registry.
   *
   * - Empty or whitespace-only label → {ok:false, error:{kind:"invalid_label"}}
   * - Duplicate slug → {ok:false, error:{kind:"duplicate"}}
   * - Write error → {ok:false, error:{kind:"write_error", message}}
   * - Success → {ok:true}
   */
  async addTerm(
    kind: "category" | "tag",
    label: string,
    description?: string
  ): Promise<AddTermResult> {
    if (!label || !label.trim()) {
      return { ok: false, error: { kind: "invalid_label" } };
    }

    const trimmedLabel = label.trim();
    const slug =
      kind === "category"
        ? joinSlug(slugifyCategory(trimmedLabel))
        : slugifyTag(trimmedLabel);

    const registry = await this.read();
    const array = kind === "category" ? registry.categories : registry.tags;

    // Check for duplicate slug
    const isDuplicate = array.some((term) => {
      const termSlug =
        kind === "category"
          ? joinSlug(slugifyCategory(term.label))
          : slugifyTag(term.label);
      return termSlug === slug;
    });

    if (isDuplicate) {
      return { ok: false, error: { kind: "duplicate" } };
    }

    const newTerm = {
      label: trimmedLabel,
      ...(description !== undefined ? { description } : {}),
    };

    if (kind === "category") {
      registry.categories = [...registry.categories, newTerm];
    } else {
      registry.tags = [...registry.tags, newTerm];
    }

    try {
      await this.write(registry);
    } catch (err) {
      return {
        ok: false,
        error: { kind: "write_error", message: String(err) },
      };
    }

    return { ok: true };
  }

  /**
   * Remove a term from the registry by its derived slug.
   * Graceful no-op if the slug is not found — writes back unchanged, returns {ok:true}.
   */
  async removeTerm(
    kind: "category" | "tag",
    slug: string
  ): Promise<RemoveTermResult> {
    const registry = await this.read();

    if (kind === "category") {
      registry.categories = registry.categories.filter((term) => {
        const termSlug = joinSlug(slugifyCategory(term.label));
        return termSlug.toLowerCase() !== slug.toLowerCase();
      });
    } else {
      registry.tags = registry.tags.filter((term) => {
        const termSlug = slugifyTag(term.label);
        return termSlug.toLowerCase() !== slug.toLowerCase();
      });
    }

    try {
      await this.write(registry);
    } catch (err) {
      return {
        ok: false,
        error: { kind: "write_error", message: String(err) },
      };
    }

    return { ok: true };
  }

  /**
   * Update an existing term's label and/or description.
   * Graceful no-op if the slug is not found — returns {ok:true}.
   * If label changes, checks for slug collision → {ok:false, error:{kind:"duplicate"}}.
   */
  async updateTerm(
    kind: "category" | "tag",
    slug: string,
    updates: { label?: string; description?: string }
  ): Promise<AddTermResult> {
    const registry = await this.read();
    const array = kind === "category" ? registry.categories : registry.tags;

    const index = array.findIndex((term) => {
      const termSlug =
        kind === "category"
          ? joinSlug(slugifyCategory(term.label))
          : slugifyTag(term.label);
      return termSlug.toLowerCase() === slug.toLowerCase();
    });

    if (index === -1) {
      // Graceful no-op
      return { ok: true };
    }

    // If label is changing, check for slug collision
    if (updates.label !== undefined) {
      const newSlug =
        kind === "category"
          ? joinSlug(slugifyCategory(updates.label.trim()))
          : slugifyTag(updates.label.trim());

      const collision = array.some((term, i) => {
        if (i === index) return false;
        const termSlug =
          kind === "category"
            ? joinSlug(slugifyCategory(term.label))
            : slugifyTag(term.label);
        return termSlug === newSlug;
      });

      if (collision) {
        return { ok: false, error: { kind: "duplicate" } };
      }
    }

    const updated = { ...array[index] };
    if (updates.label !== undefined) {
      updated.label = updates.label.trim();
    }
    if (updates.description !== undefined) {
      updated.description = updates.description;
    }

    const updatedArray = [...array];
    updatedArray[index] = updated;

    if (kind === "category") {
      registry.categories = updatedArray;
    } else {
      registry.tags = updatedArray;
    }

    try {
      await this.write(registry);
    } catch (err) {
      return {
        ok: false,
        error: { kind: "write_error", message: String(err) },
      };
    }

    return { ok: true };
  }
}

// ============================================================
// Factory
// ============================================================

/**
 * Returns an FsTaxonomyRegistryWriter pointing at the production config/taxonomies.yaml.
 * NOT cached, NOT wrapped in 'use cache'.
 */
export function getTaxonomyRegistryWriter(): FsTaxonomyRegistryWriter {
  return new FsTaxonomyRegistryWriter(
    path.join(process.cwd(), "config", "taxonomies.yaml")
  );
}
