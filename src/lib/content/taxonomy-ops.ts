// Pure taxonomy transform utilities.
// NO filesystem imports. NO Next.js imports. NO framework imports.
// Fully unit-testable in isolation.

// ============================================================
// Internal helpers
// ============================================================

/**
 * The single match predicate for all taxonomy operations.
 * Trimmed, case-insensitive, exact raw-string equality.
 * NOT slug-based, NOT prefix-cascade.
 * "Tech" will never match "Tech/JavaScript" — they are different raw strings.
 */
function matchesTerm(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Deduplicate an array preserving first-occurrence order.
 * Comparison is by trimmed-lowercase key; the surviving element keeps its original casing.
 */
function dedupePreserveFirst(arr: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arr) {
    const key = item.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

// ============================================================
// Public API
// ============================================================

/**
 * Replace every element in arr that matches oldValue (trimmed, case-insensitive)
 * with newValue, then deduplicate preserving first-occurrence order.
 * Does NOT mutate the input array.
 */
export function renameInArray(
  arr: string[],
  oldValue: string,
  newValue: string
): string[] {
  const replaced = arr.map((item) =>
    matchesTerm(item, oldValue) ? newValue : item
  );
  return dedupePreserveFirst(replaced);
}

/**
 * Replace every element in arr that matches source (trimmed, case-insensitive)
 * with target, then deduplicate preserving first-occurrence order.
 * Semantically identical to renameInArray(arr, source, target) — kept separate
 * for intent clarity at the call site.
 * Does NOT mutate the input array.
 */
export function mergeInArray(
  arr: string[],
  source: string,
  target: string
): string[] {
  const replaced = arr.map((item) =>
    matchesTerm(item, source) ? target : item
  );
  return dedupePreserveFirst(replaced);
}

/**
 * Remove every element in arr that matches value (trimmed, case-insensitive).
 * Empty-result handling:
 *   - field === "categories" → returns ["Uncategorized"] (mirrors schema default, D4)
 *   - field === "tags"       → returns [] (D5)
 * Does NOT mutate the input array.
 */
export function removeFromArray(
  arr: string[],
  value: string,
  field: "categories" | "tags"
): string[] {
  const filtered = arr.filter((item) => !matchesTerm(item, value));
  if (filtered.length === 0) {
    return field === "categories" ? ["Uncategorized"] : [];
  }
  return filtered;
}

/**
 * Return only posts whose specified field array contains at least one element
 * that matches value (trimmed, case-insensitive).
 * Field-scoped: a match in "tags" does NOT satisfy a "categories" query.
 */
export function findAffectedPosts<
  T extends { slug: string; tags: string[]; categories: string[] }
>(posts: T[], field: "categories" | "tags", value: string): T[] {
  return posts.filter((post) =>
    post[field].some((item) => matchesTerm(item, value))
  );
}
