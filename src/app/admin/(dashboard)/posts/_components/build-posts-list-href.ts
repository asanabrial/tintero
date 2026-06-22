import type { AdminStatus } from "@/lib/content";

export interface PostsListHrefParams {
  status: AdminStatus | "all";
  /** Already-trimmed query string. Empty string or undefined → omitted. */
  q?: string;
  /** Page number. 1 or undefined → omitted (page reset). */
  page?: number;
}

/**
 * Pure helper — builds the href for admin Posts list links.
 * Param order in the serialized URL: status → q → page.
 * No React/Next.js imports; safe to use in tests without a DOM.
 */
export function buildPostsListHref({ status, q, page }: PostsListHrefParams): string {
  const sp = new URLSearchParams();

  if (status !== "all") {
    sp.set("status", status);
  }

  const trimmedQ = q?.trim() ?? "";
  if (trimmedQ !== "") {
    sp.set("q", trimmedQ);
  }

  if (page !== undefined && page > 1) {
    sp.set("page", String(page));
  }

  const s = sp.toString();
  return s ? `?${s}` : "/admin/posts";
}
