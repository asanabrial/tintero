import { getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { SiteHeader } from "@/app/components/site-header";
import { CustomizePreview } from "./customize-preview";

// Evaluated once at module load (build time) — safe under cacheComponents: true.
const BUILD_YEAR = new Date().getFullYear();

/**
 * SiteLayout — chrome for the public-facing site (home, blog, pages, install).
 *
 * Lives in the `(site)` route group so the public SiteHeader + footer wrap ONLY
 * these routes. The admin area (src/app/admin) is outside this group and renders
 * its own dark top bar + sidebar, so the public chrome never bleeds into it.
 *
 * This is a server component (no usePathname / no client hooks) so the root layout
 * stays a pure static PPR shell — adding a dynamic client hook there would break
 * PPR and the Calamo editor's form hydration.
 */
export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // getLayoutSiteConfig() is 'use cache' -keyed with a stable constant — safe in the
  // layout shell (no uncached I/O outside Suspense, preserves PPR / static prerender).
  const config = await getLayoutSiteConfig();

  return (
    <>
      <CustomizePreview />
      <SiteHeader config={config} />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {config.footerNav && config.footerNav.length > 0 && (
          <nav aria-label={t(config.language, "common.footerNav")} className="mb-4 flex flex-wrap justify-center gap-x-6 gap-y-1">
            {config.footerNav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
        <p>
          &copy; {BUILD_YEAR} {config.author.name}. {t(config.language, "common.allRightsReserved")}
        </p>
      </footer>
    </>
  );
}
