// Redirect rules — the pure core of a Yoast-style redirect manager.
//
// A rule maps an old path (`from`) to a new location (`to`). Matching is
// case-insensitive, ignores the query string, and treats trailing slashes as
// equivalent — the common shapes for redirecting renamed or removed URLs.
// Applying a matched rule is the caller's job (e.g. the global 404 handler).

export interface RedirectRule {
  /** Source path (leading slash), e.g. "/old-post". */
  from: string;
  /** Destination path or URL, e.g. "/blog/new-post". */
  to: string;
  /** 308 (permanent) when true, 307 (temporary) otherwise. */
  permanent?: boolean;
}

/** Lowercase, strip the query string, and drop a trailing slash (except root). */
export function normalizePath(path: string): string {
  const noQuery = path.split("?")[0].split("#")[0];
  const lower = noQuery.toLowerCase();
  if (lower.length > 1 && lower.endsWith("/")) return lower.slice(0, -1);
  return lower;
}

/**
 * Find the first rule whose normalized `from` equals the normalized request
 * path. Returns null when nothing matches or when the only match would redirect
 * a path to itself (loop guard).
 */
export function matchRedirect(
  pathname: string,
  rules: RedirectRule[]
): RedirectRule | null {
  const target = normalizePath(pathname);
  for (const rule of rules) {
    if (normalizePath(rule.from) !== target) continue;
    // Loop guard: a rule pointing at its own source is a no-op.
    if (normalizePath(rule.to) === target) return null;
    return rule;
  }
  return null;
}
