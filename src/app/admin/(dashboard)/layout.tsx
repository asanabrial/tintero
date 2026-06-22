import { Suspense } from "react";
import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { logout } from "../login/actions";
import { NAV_GROUPS, filterNavByRole, NAV_KEY } from "@/lib/admin/nav-groups";
import { can } from "@/lib/auth/capabilities";
import { getCommentRepository } from "@/lib/comments";
import { getLayoutSiteConfig } from "@/lib/content";
import { resolveLocale, t } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/provider";
import { AdminNav } from "./_components/admin-nav";
import { AdminTopBar } from "./_components/admin-top-bar";

/**
 * Pending-comment badge for the admin nav. Best-effort: gated by the moderation
 * capability and wrapped in try/catch so a missing DATABASE_URL or DB outage
 * never breaks the sidebar — it just shows no badge.
 */
async function getNavBadges(role: Parameters<typeof can>[0]): Promise<Record<string, number>> {
  if (!can(role, "comments:moderate")) return {};
  try {
    const pending = (await getCommentRepository().listPending()).length;
    return pending > 0 ? { "/admin/comments": pending } : {};
  } catch {
    return {};
  }
}

// Lightweight nav skeleton shown while RoleNav resolves.
// Height matches the sidebar nav area so the sidebar chrome doesn't shift.
function NavSkeleton() {
  return <div className="flex-1" aria-hidden="true" />;
}

/**
 * RoleNav — async server component that reads the session role and renders
 * a role-filtered AdminNav (ADR-R6).
 *
 * Lives inside the EXISTING <Suspense fallback={NavSkeleton}> slot in SidebarShell.
 * verifySession() is react-cache()'d — no extra DB call beyond AuthGate.
 * SidebarShell stays static → sidebar persists across client navigations (8c83a87 fix intact).
 */
async function RoleNav() {
  const { role } = await verifySession();
  const badges = await getNavBadges(role);
  return <AdminNav groups={filterNavByRole(NAV_GROUPS, role)} badges={badges} />;
}

/**
 * MobileRoleNav — async server component that role-filters the mobile nav (ADR-5).
 * verifySession() is react-cache()'d — no extra DB call beyond AuthGate.
 * Lives inside a <Suspense fallback={null}> slot so SidebarShell stays static.
 */
async function MobileRoleNav() {
  const [{ role }, config] = await Promise.all([
    verifySession(),
    getLayoutSiteConfig(),
  ]);
  const locale = resolveLocale(config.language);
  const groups = filterNavByRole(NAV_GROUPS, role);
  const links = groups.flatMap((g) => g.items);
  return (
    <nav className="flex flex-wrap gap-2" aria-label={t(locale, "admin.adminNav")}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
        >
          {NAV_KEY[link.href] ? t(locale, `admin.nav.${NAV_KEY[link.href]}`) : link.label}
        </Link>
      ))}
    </nav>
  );
}

// Static sidebar chrome — part of the PPR static shell, so it stays painted
// across client navigations instead of blanking. The sidebar holds only static
// nav chrome (no user data), so rendering it in the shell leaks nothing.
//
// Auth is enforced in two authoritative layers that do NOT live in this shell:
//   1. proxy.ts redirects unauthenticated /admin and /admin/* to /admin/login
//      at the edge, before this layout ever renders.
//   2. AuthGate (below) + each page's own verifySession() (DB-backed) re-check
//      at request time as defense in depth.
// Previously the whole chrome was gated behind a dynamic <Suspense> whose
// fallback was a blank screen; because verifySession() made that boundary
// re-suspend, the entire sidebar blanked on every client navigation. Keeping
// the sidebar static fixes that without weakening auth, since the proxy already
// prevents unauthenticated access to /admin/*.
function SidebarShell({ children, locale }: { children: React.ReactNode; locale: string }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#f0f0f1] dark:bg-zinc-950">
      {/* Admin theme boot script — applies the persisted color-scheme preference
          (ThemeToggle) before paint so there is no flash on reload. Admin-scoped:
          the key must match ADMIN_SCHEME_STORAGE_KEY in theme-toggle.tsx. The
          public site is untouched (no boot script there). */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){try{var v=localStorage.getItem('tintero-admin-color-scheme');if(v==='dark'||v==='light'){document.documentElement.setAttribute('data-color-scheme',v);}}catch(e){}})();",
        }}
      />
      {/* Top bar — static chrome with a single async user-slot behind Suspense */}
      <AdminTopBar locale={locale} />

      <div className="flex flex-1 flex-col lg:flex-row min-h-0">
        {/* Sidebar — hidden on mobile, visible on lg+ */}
        {/* WordPress-style admin menu: fixed dark charcoal regardless of the
            site color scheme, white brand, blue active item. */}
        <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 bg-[#1d2327] text-[#c3c4c7]">
          <div className="p-4 border-b border-white/10">
            <Link
              href="/admin"
              className="text-sm font-semibold text-white hover:text-white/80 transition-colors"
            >
              Admin
            </Link>
          </div>
          {/* RoleNav resolves the role and renders a filtered AdminNav (ADR-R6).
              SidebarShell stays static — only RoleNav suspends, same boundary as before.
              Sidebar persistence from 8c83a87 is preserved. */}
          <Suspense fallback={<NavSkeleton />}>
            <RoleNav />
          </Suspense>
          <div className="p-3 border-t border-white/10">
            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-md px-3 py-2 text-sm text-[#c3c4c7] hover:bg-[#2c3338] hover:text-white transition-colors text-left"
              >
                {t(locale, "admin.signOut")}
              </button>
            </form>
          </div>
        </aside>

        {/* Mobile nav — role-filtered via async MobileRoleNav in a Suspense slot.
            fallback={null} prevents layout shift during streaming (ADR-5). */}
        <div className="lg:hidden border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
          <Suspense fallback={null}>
            <MobileRoleNav />
          </Suspense>
        </div>

        {/* Main content — wide measure so list tables breathe; form-heavy
            pages (settings, profile, editor) constrain themselves internally. */}
        <main className="flex-1 p-6 lg:p-8 min-w-0">
          <div className="mx-auto w-full max-w-[100rem]">{children}</div>
          {/* WordPress-style admin footer. */}
          <footer className="mx-auto mt-10 w-full max-w-[100rem] border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {t(locale, "admin.footerPrefix")}{" "}
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="text-[#2271b1] hover:underline dark:text-[#4f94d4]"
            >
              Tintero
            </a>
            .
          </footer>
        </main>
      </div>
    </div>
  );
}

// Dynamic auth gate — scoped to the main content only, so navigation suspends
// just the content area (showing a lightweight skeleton), never the sidebar.
async function AuthGate({ children }: { children: React.ReactNode }) {
  await verifySession();
  return <>{children}</>;
}

function ContentSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="h-7 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-full max-w-md rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-full max-w-sm rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The site language (config.language) drives the whole admin UI — the
  // WordPress model. getLayoutSiteConfig() is 'use cache', so this stays cheap
  // and keeps the sidebar shell cacheable.
  const config = await getLayoutSiteConfig();
  const locale = resolveLocale(config.language);

  // The sidebar shell is static and persists across navigation. Only the gated
  // content area suspends, so the admin menu never blanks while moving between
  // pages — matching WordPress's always-present wp-admin sidebar.
  return (
    <LocaleProvider locale={locale}>
      <SidebarShell locale={locale}>
        <Suspense fallback={<ContentSkeleton />}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </SidebarShell>
    </LocaleProvider>
  );
}
