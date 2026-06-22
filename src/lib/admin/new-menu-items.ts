// new-menu-items.ts — PURE helper, zero framework imports.
// Maps a role to the ordered list of "+ New" top-bar menu items
// the role is permitted to access, based on static capability sets.

import type { Role } from "@/lib/auth/types";

export interface NewMenuItem {
  label: string;
  href: string;
}

/**
 * All possible "+ New" items in display order.
 * Each entry carries the capability that gates it.
 */
const ALL_ITEMS: ReadonlyArray<{
  label: string;
  href: string;
  /** Role predicate — true when this role may see the item. */
  roles: ReadonlySet<Role>;
}> = [
  {
    label: "New Post",
    href: "/admin/posts/new",
    // posts:create — admin, editor, author
    roles: new Set<Role>(["admin", "editor", "author"]),
  },
  {
    label: "New Page",
    href: "/admin/pages/new",
    // pages:create — admin, editor only
    roles: new Set<Role>(["admin", "editor"]),
  },
  {
    label: "Upload Media",
    href: "/admin/media",
    // media:upload — admin, editor, author
    roles: new Set<Role>(["admin", "editor", "author"]),
  },
  {
    label: "New User",
    href: "/admin/users",
    // users:manage — admin only (no dedicated /new route; form is inline)
    roles: new Set<Role>(["admin"]),
  },
];

/**
 * Returns the ordered "+ New" menu items visible to `role`.
 * Returns a fresh array on every call (no shared mutable state).
 */
export function newMenuItemsForRole(role: Role): NewMenuItem[] {
  return ALL_ITEMS.filter((item) => item.roles.has(role)).map(({ label, href }) => ({
    label,
    href,
  }));
}
