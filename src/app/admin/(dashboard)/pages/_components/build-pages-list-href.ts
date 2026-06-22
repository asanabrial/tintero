export interface PagesListHrefParams {
  /** Already-trimmed query string. Empty/whitespace/undefined => omitted. */
  q?: string;
  /** Page number. 1 or undefined => omitted (page reset). */
  page?: number;
}

/**
 * Pure helper — builds the href for admin Pages list links.
 * Param order in the serialized URL: q -> page.
 * No React/Next.js imports; safe to use in tests without a DOM.
 */
export function buildPagesListHref({ q, page }: PagesListHrefParams): string {
  const sp = new URLSearchParams();

  const trimmedQ = q?.trim() ?? "";
  if (trimmedQ !== "") {
    sp.set("q", trimmedQ);
  }

  if (page !== undefined && page > 1) {
    sp.set("page", String(page));
  }

  const s = sp.toString();
  return s ? `?${s}` : "/admin/pages";
}
