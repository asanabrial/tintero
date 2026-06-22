"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemActive } from "@/lib/admin/nav-active";
import type { NavGroup } from "@/lib/admin/nav-groups";
import { NAV_KEY, SECTION_KEY } from "@/lib/admin/nav-groups";
import { useT } from "@/lib/i18n/provider";
import { NAV_ICONS } from "./admin-nav-icons";

export type { NavItem, NavGroup } from "@/lib/admin/nav-groups";

// WordPress menu states on the dark charcoal sidebar: the current item is a
// solid blue (#2271b1) row with white text; others are light-gray, lightening
// on hover.
const ACTIVE = "bg-[#2271b1] text-white font-medium";
const INACTIVE =
  "text-[#c3c4c7] hover:bg-[#2c3338] hover:text-white";

interface AdminNavProps {
  /** Filtered nav groups to render. Supplied by the RoleNav server component. */
  groups: NavGroup[];
  /** Optional count badges keyed by nav href (e.g. pending comments). */
  badges?: Record<string, number>;
}

/**
 * AdminNav — presentational client island.
 * Accepts pre-filtered groups from the RoleNav server component (ADR-R6).
 * Does NOT import NAV_GROUPS directly — role filtering is server-side only.
 * Keeps "use client" for usePathname (active state highlight).
 */
export function AdminNav({ groups, badges }: AdminNavProps) {
  const pathname = usePathname();
  const tr = useT();
  return (
    <nav className="flex-1 p-3 space-y-1" aria-label={tr("admin.adminNav")}>
      {groups.map((group, i) => (
        <div key={group.label ?? "_pinned"} className={i > 0 ? "pt-3" : undefined}>
          {group.label && (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-white/40">
              {SECTION_KEY[group.label] ? tr(`admin.sections.${SECTION_KEY[group.label]}`) : group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const badge = badges?.[item.href] ?? 0;
            const label = NAV_KEY[item.href] ? tr(`admin.nav.${NAV_KEY[item.href]}`) : item.label;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? ACTIVE : INACTIVE}`}
              >
                {NAV_ICONS[item.href]}
                <span>{label}</span>
                {badge > 0 && (
                  <span
                    className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white"
                    aria-label={`${badge} pending`}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
