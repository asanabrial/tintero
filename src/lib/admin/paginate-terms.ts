/**
 * Pure helper — filters a list of taxonomy terms by a text query and paginates the result.
 * Works with any object that has `label` and `slug` string fields (Tag, Category, etc.).
 * No React/Next.js imports; safe to use in tests without a DOM.
 */

export interface TaxonomyTermLike {
  label: string;
  slug: string;
}

export interface PaginateTermsOptions {
  /** Raw search query — trimmed and lowercased internally. Empty/whitespace → no filter. */
  query: string;
  /** 1-based page number. Values < 1 or NaN are clamped to 1; values above totalPages are clamped down. */
  page: number;
  /** Number of items per page. */
  pageSize: number;
}

export interface PaginateTermsResult<T extends TaxonomyTermLike> {
  /** The slice of terms for the current page. */
  items: T[];
  /** Total count after filtering (before pagination). */
  total: number;
  /** Clamped 1-based page number actually used. */
  page: number;
  /** Total number of pages — always at least 1. */
  totalPages: number;
}

/**
 * Filter terms by `query` (substring match on `label` or `slug`, case-insensitive)
 * and return the requested page slice.
 */
export function filterAndPaginateTerms<T extends TaxonomyTermLike>(
  terms: T[],
  { query, page, pageSize }: PaginateTermsOptions,
): PaginateTermsResult<T> {
  const needle = query.trim().toLowerCase();

  const filtered =
    needle === ""
      ? terms
      : terms.filter(
          (t) =>
            t.label.toLowerCase().includes(needle) ||
            t.slug.toLowerCase().includes(needle),
        );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Clamp page: NaN/<=0 → 1; > totalPages → totalPages
  const safePage =
    !Number.isFinite(page) || page < 1
      ? 1
      : page > totalPages
        ? totalPages
        : Math.floor(page);

  const start = (safePage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total, page: safePage, totalPages };
}
