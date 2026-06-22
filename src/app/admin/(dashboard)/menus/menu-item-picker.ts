// menu-item-picker.ts
// Pure helpers for the menu item picker — no React, no Next, no FS imports.

import type { NavItem } from "@/lib/content/schema";

/**
 * Build the site-relative URL for a category given its pre-slugified slug.
 * Category.slug is already in "tech/javascript" form (segments joined with "/").
 */
export function buildCategoryHref(slug: string): string {
  return `/blog/categories/${slug}`;
}

/**
 * Pure reducer for the `add-link` intent.
 * Returns a new array with `{ label, href }` appended to `base`.
 * Never mutates `base`.
 */
export function applyAddLinkIntent(
  base: readonly NavItem[],
  label: string,
  href: string
): NavItem[] {
  return [...base, { label, href }];
}
