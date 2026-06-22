import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { newMenuItemsForRole } from "@/lib/admin/new-menu-items";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";

/**
 * AdminTopBarNewDropdown — async server component (mirrors AdminTopBarUserSlot).
 *
 * Renders a native <details>/<summary> disclosure widget for progressive
 * enhancement — works without client JS. RBAC-aware: only menu items the
 * session role can access are rendered.
 *
 * Mount inside a <Suspense> boundary in the top bar (same pattern as the
 * user slot) so the rest of the header renders immediately.
 */
export async function AdminTopBarNewDropdown() {
  const session = await verifySession(); // react cache() deduped — no extra DB hit
  const items = newMenuItemsForRole(session.role);
  const { language: loc } = await getLayoutSiteConfig();

  if (items.length === 0) return null;

  return (
    <details className="relative">
      <summary
        className="list-none cursor-pointer select-none text-zinc-300 hover:text-white transition-colors"
        aria-haspopup="menu"
      >
        {t(loc, "admin.addNew")}
      </summary>
      <ul
        role="menu"
        className="absolute left-0 top-full mt-1 z-50 min-w-[10rem] rounded border border-zinc-700 bg-zinc-800 py-1 shadow-lg"
      >
        {items.map((item) => (
          <li key={item.href} role="none">
            <Link
              href={item.href}
              role="menuitem"
              className="block px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 hover:text-white transition-colors whitespace-nowrap"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
