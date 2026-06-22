/**
 * Pure helper — decides whether a sidebar nav item is the active route.
 *
 * `/admin` (the Dashboard root) is matched EXACTLY, otherwise every page under
 * `/admin/...` would also highlight Dashboard. Every other href matches its own
 * path or any descendant (so `/admin/posts/new` highlights the Posts item).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}
