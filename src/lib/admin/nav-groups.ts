import { can } from "@/lib/auth/capabilities";
import type { Action } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/auth/types";

export interface NavItem {
  href: string;
  label: string;
  /** Required capability to show this item. Absent = always visible (Dashboard, Profile). */
  requiredAction?: Action;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/admin", label: "Dashboard" }] },
  {
    label: "Content",
    items: [
      { href: "/admin/posts", label: "Posts", requiredAction: "posts:create" },
      { href: "/admin/pages", label: "Pages", requiredAction: "pages:create" },
      { href: "/admin/media", label: "Media", requiredAction: "media:upload" },
      { href: "/admin/categories", label: "Categories", requiredAction: "categories:manage" },
      { href: "/admin/tags", label: "Tags", requiredAction: "tags:manage" },
      { href: "/admin/graph", label: "Graph", requiredAction: "posts:create" },
    ],
  },
  {
    label: "Discussion",
    items: [{ href: "/admin/comments", label: "Comments", requiredAction: "comments:moderate" }],
  },
  {
    label: "Appearance",
    items: [
      { href: "/admin/menus", label: "Menus", requiredAction: "menus:manage" },
      { href: "/admin/widgets", label: "Widgets", requiredAction: "appearance:manage" },
      { href: "/admin/appearance", label: "Customize", requiredAction: "appearance:manage" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/profile", label: "Profile" },
      { href: "/admin/users", label: "Users", requiredAction: "users:manage" },
      { href: "/admin/settings", label: "Settings", requiredAction: "settings:manage" },
      { href: "/admin/redirects", label: "Redirects", requiredAction: "settings:manage" },
      { href: "/admin/tools", label: "Tools", requiredAction: "tools:access" },
    ],
  },
];

// href → translation key under admin.nav.* (stable mapping; labels themselves
// stay English in NAV_GROUPS so role-filtering and tests are unaffected).
export const NAV_KEY: Record<string, string> = {
  "/admin": "dashboard",
  "/admin/posts": "posts",
  "/admin/pages": "pages",
  "/admin/media": "media",
  "/admin/categories": "categories",
  "/admin/tags": "tags",
  "/admin/graph": "graph",
  "/admin/comments": "comments",
  "/admin/menus": "menus",
  "/admin/widgets": "widgets",
  "/admin/appearance": "customize",
  "/admin/profile": "profile",
  "/admin/users": "users",
  "/admin/settings": "settings",
  "/admin/redirects": "redirects",
  "/admin/tools": "tools",
};

// Group label → translation key under admin.sections.*.
export const SECTION_KEY: Record<string, string> = {
  Content: "content",
  Discussion: "discussion",
  Appearance: "appearance",
  Admin: "admin",
};

/**
 * Filters NAV_GROUPS to only items the given role may see.
 * Items without requiredAction (Dashboard, Profile) are always included.
 * Groups that become empty after filtering are omitted.
 * Pure function — no side effects, no async, fully unit-testable.
 */
export function filterNavByRole(groups: NavGroup[], role: Role): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (item) => !item.requiredAction || can(role, item.requiredAction)
      ),
    }))
    .filter((g) => g.items.length > 0);
}
