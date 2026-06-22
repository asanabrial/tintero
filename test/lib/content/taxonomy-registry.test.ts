/**
 * Tests for taxonomy-registry.ts and taxonomy-registry-writer.ts
 *
 * WU-1: Schema parsing (pure unit — no FS)
 * WU-2: loadTaxonomyRegistry (FS — uses tmpdir)
 * WU-3: mergeCategoryIndex
 * WU-4: mergeTagIndex
 * WU-5: FsTaxonomyRegistryWriter (FS — uses tmpdir)
 *
 * TDD: these tests were written before the implementation files existed.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { parse as parseYaml } from "yaml";

import {
  TaxonomyRegistrySchema,
  loadTaxonomyRegistry,
  mergeCategoryIndex,
  mergeTagIndex,
} from "../../../src/lib/content/taxonomy-registry";
import {
  FsTaxonomyRegistryWriter,
  getTaxonomyRegistryWriter,
} from "../../../src/lib/content/taxonomy-registry-writer";

// ============================================================
// WU-1: Schema parsing (pure unit — no FS)
// ============================================================

describe("TaxonomyRegistrySchema — valid input", () => {
  test("parses valid categories and tags correctly", () => {
    const result = TaxonomyRegistrySchema.parse({
      categories: [{ label: "Tech" }],
      tags: [{ label: "rust", description: "The language" }],
    });
    expect(result.categories).toEqual([{ label: "Tech" }]);
    expect(result.tags).toEqual([{ label: "rust", description: "The language" }]);
  });

  test("extra unknown fields are stripped silently", () => {
    const result = TaxonomyRegistrySchema.parse({
      categories: [{ label: "Tech", unknownField: "ignored" }],
      tags: [],
    });
    expect(result.categories[0]).not.toHaveProperty("unknownField");
    expect(result.categories[0].label).toBe("Tech");
  });
});

describe("TaxonomyRegistrySchema — resilient block-level fallback", () => {
  test("bad categories block (not an array) → falls back to empty array, tags preserved", () => {
    const result = TaxonomyRegistrySchema.parse({
      categories: "not-an-array",
      tags: [{ label: "rust" }],
    });
    expect(result.categories).toEqual([]);
    expect(result.tags).toEqual([{ label: "rust" }]);
  });

  test("bad tags block → falls back to empty array, categories preserved", () => {
    const result = TaxonomyRegistrySchema.parse({
      categories: [{ label: "Tech" }],
      tags: "not-an-array",
    });
    expect(result.tags).toEqual([]);
    expect(result.categories).toEqual([{ label: "Tech" }]);
  });

  test("both blocks bad → {categories:[], tags:[]}", () => {
    const result = TaxonomyRegistrySchema.parse({
      categories: 42,
      tags: null,
    });
    expect(result.categories).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  test("empty {} → {categories:[], tags:[]}", () => {
    const result = TaxonomyRegistrySchema.parse({});
    expect(result.categories).toEqual([]);
    expect(result.tags).toEqual([]);
  });
});

// ============================================================
// WU-2: loadTaxonomyRegistry (FS — uses tmpdir)
// ============================================================

describe("loadTaxonomyRegistry", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-registry-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("missing file returns {categories:[], tags:[]} without throwing", async () => {
    const filePath = path.join(tmpDir, "nonexistent.yaml");
    const result = await loadTaxonomyRegistry(filePath);
    expect(result).toEqual({ categories: [], tags: [] });
  });

  test("valid YAML file returns parsed data", async () => {
    const filePath = path.join(tmpDir, "taxonomies.yaml");
    await fs.writeFile(
      filePath,
      "categories:\n  - label: Tech\ntags:\n  - label: rust\n    description: The language\n",
      "utf-8"
    );
    const result = await loadTaxonomyRegistry(filePath);
    expect(result.categories).toEqual([{ label: "Tech" }]);
    expect(result.tags).toEqual([{ label: "rust", description: "The language" }]);
  });

  test("malformed YAML returns {categories:[], tags:[]} without throwing", async () => {
    const filePath = path.join(tmpDir, "taxonomies.yaml");
    await fs.writeFile(filePath, ": this is not valid yaml: [\n  unclosed", "utf-8");
    const result = await loadTaxonomyRegistry(filePath);
    expect(result).toEqual({ categories: [], tags: [] });
  });

  test("file with bad categories block returns {categories:[], tags:[...valid tags...]}", async () => {
    const filePath = path.join(tmpDir, "taxonomies.yaml");
    await fs.writeFile(
      filePath,
      "categories: not-an-array\ntags:\n  - label: rust\n",
      "utf-8"
    );
    const result = await loadTaxonomyRegistry(filePath);
    expect(result.categories).toEqual([]);
    expect(result.tags).toEqual([{ label: "rust" }]);
  });
});

// ============================================================
// WU-3: mergeCategoryIndex
// ============================================================

describe("mergeCategoryIndex", () => {
  test("derived-only (no registered) → unchanged output", () => {
    const derived = [
      { segments: ["tech"], slug: "tech", label: "Tech", count: 3, depth: 1 },
    ];
    const result = mergeCategoryIndex(derived, []);
    expect(result).toEqual(derived);
  });

  test("registered-only term → appears with count 0, label/slug from registered, segments/depth derived", () => {
    const result = mergeCategoryIndex([], [{ label: "Technology" }]);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("technology");
    expect(result[0].count).toBe(0);
    expect(result[0].label).toBe("Technology");
    expect(result[0].segments).toEqual(["technology"]);
    expect(result[0].depth).toBe(1);
  });

  test("overlap: slug matches derived → count preserved from derived, description attached from registered", () => {
    const derived = [
      { segments: ["tech"], slug: "tech", label: "Tech", count: 5, depth: 1 },
    ];
    const result = mergeCategoryIndex(derived, [{ label: "Tech", description: "Technology topics" }]);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(5);
    expect(result[0].description).toBe("Technology topics");
  });

  test("no duplicate entries — same slug from both derived and registered → one entry", () => {
    const derived = [
      { segments: ["rust"], slug: "rust", label: "Rust", count: 2, depth: 1 },
    ];
    const result = mergeCategoryIndex(derived, [{ label: "Rust" }]);
    expect(result).toHaveLength(1);
  });

  test("sorts alphabetically by slug", () => {
    const derived = [
      { segments: ["zig"], slug: "zig", label: "Zig", count: 1, depth: 1 },
      { segments: ["apple"], slug: "apple", label: "Apple", count: 2, depth: 1 },
    ];
    const result = mergeCategoryIndex(derived, [{ label: "Mango" }]);
    const slugs = result.map((c) => c.slug);
    expect(slugs).toEqual([...slugs].sort());
  });

  test("description from registered attaches onto derived match", () => {
    const derived = [
      { segments: ["golang"], slug: "golang", label: "Go", count: 4, depth: 1 },
    ];
    const result = mergeCategoryIndex(derived, [{ label: "Golang", description: "The Go language" }]);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("The Go language");
    expect(result[0].count).toBe(4);
  });

  test("hierarchical registered-only term derives correct segments and depth", () => {
    const result = mergeCategoryIndex([], [{ label: "Tech/JavaScript" }]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const jsEntry = result.find((c) => c.slug === "tech/javascript");
    expect(jsEntry).toBeDefined();
    expect(jsEntry?.segments).toEqual(["tech", "javascript"]);
    expect(jsEntry?.depth).toBe(2);
  });
});

// ============================================================
// WU-4: mergeTagIndex
// ============================================================

describe("mergeTagIndex", () => {
  test("derived-only → unchanged", () => {
    const derived = [
      { slug: "rust", label: "Rust", count: 3 },
    ];
    const result = mergeTagIndex(derived, []);
    expect(result).toEqual(derived);
  });

  test("registered-only → appears with count 0", () => {
    const result = mergeTagIndex([], [{ label: "golang" }]);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("golang");
    expect(result[0].count).toBe(0);
    expect(result[0].label).toBe("golang");
  });

  test("overlap: count from derived + description from registered", () => {
    const derived = [{ slug: "rust", label: "Rust", count: 7 }];
    const result = mergeTagIndex(derived, [{ label: "rust", description: "Systems language" }]);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(7);
    expect(result[0].description).toBe("Systems language");
  });

  test("no duplicates by slug", () => {
    const derived = [{ slug: "rust", label: "Rust", count: 2 }];
    const result = mergeTagIndex(derived, [{ label: "Rust" }]);
    expect(result).toHaveLength(1);
  });
});

// ============================================================
// WU-5: FsTaxonomyRegistryWriter (FS — uses tmpdir)
// ============================================================

describe("FsTaxonomyRegistryWriter", () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "taxonomy-writer-test-"));
    filePath = path.join(tmpDir, "taxonomies.yaml");
    await fs.writeFile(filePath, "categories: []\ntags: []\n", "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // --- addTerm: category ---

  test("addTerm category on empty file → file contains {categories:[{label:'Tech'}], tags:[]}", async () => {
    const writer = new FsTaxonomyRegistryWriter(filePath);
    const result = await writer.addTerm("category", "Tech");
    expect(result.ok).toBe(true);

    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = parseYaml(raw) as { categories: unknown[]; tags: unknown[] };
    expect(parsed.categories).toEqual([{ label: "Tech" }]);
    expect(parsed.tags).toEqual([]);
  });

  test("addTerm tag with description → tag entry with description", async () => {
    const writer = new FsTaxonomyRegistryWriter(filePath);
    const result = await writer.addTerm("tag", "rust", "The systems language");
    expect(result.ok).toBe(true);

    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = parseYaml(raw) as { categories: unknown[]; tags: unknown[] };
    expect(parsed.tags).toEqual([{ label: "rust", description: "The systems language" }]);
  });

  test("addTerm category twice with same label → returns {ok:false, error:{kind:'duplicate'}}", async () => {
    const writer = new FsTaxonomyRegistryWriter(filePath);
    await writer.addTerm("category", "Tech");
    const result = await writer.addTerm("category", "Tech");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("duplicate");
    }
  });

  test("addTerm category with empty label → returns {ok:false, error:{kind:'invalid_label'}}", async () => {
    const writer = new FsTaxonomyRegistryWriter(filePath);
    const result = await writer.addTerm("category", "");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_label");
    }
  });

  test("addTerm category with whitespace-only label → returns {ok:false, error:{kind:'invalid_label'}}", async () => {
    const writer = new FsTaxonomyRegistryWriter(filePath);
    const result = await writer.addTerm("category", "  ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_label");
    }
  });

  // --- removeTerm ---

  test("removeTerm category where slug matches → entry removed", async () => {
    const writer = new FsTaxonomyRegistryWriter(filePath);
    await writer.addTerm("category", "Tech");
    const result = await writer.removeTerm("category", "tech");
    expect(result.ok).toBe(true);

    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = parseYaml(raw) as { categories: unknown[]; tags: unknown[] };
    expect(parsed.categories).toEqual([]);
  });

  test("removeTerm tag with non-existent slug → graceful no-op, returns {ok:true}", async () => {
    const writer = new FsTaxonomyRegistryWriter(filePath);
    const result = await writer.removeTerm("tag", "non-existent");
    expect(result.ok).toBe(true);
  });

  // --- atomic write ---

  test("atomic write: final file content is valid YAML after addTerm", async () => {
    const writer = new FsTaxonomyRegistryWriter(filePath);
    await writer.addTerm("category", "Science");

    const raw = await fs.readFile(filePath, "utf-8");
    let parseError: unknown = null;
    let parsed: unknown = null;
    try {
      parsed = parseYaml(raw);
    } catch (e) {
      parseError = e;
    }
    expect(parseError).toBeNull();
    expect(parsed).toBeDefined();
  });

  test("temp file is not left behind after successful write", async () => {
    const writer = new FsTaxonomyRegistryWriter(filePath);
    await writer.addTerm("category", "Tech");

    const tmpFile = path.join(tmpDir, ".taxonomies.yaml.tmp");
    let tmpExists = false;
    try {
      await fs.access(tmpFile);
      tmpExists = true;
    } catch {
      tmpExists = false;
    }
    expect(tmpExists).toBe(false);
  });
});

describe("getTaxonomyRegistryWriter", () => {
  test("returns an FsTaxonomyRegistryWriter instance", () => {
    const writer = getTaxonomyRegistryWriter();
    expect(writer).toBeInstanceOf(FsTaxonomyRegistryWriter);
  });
});
