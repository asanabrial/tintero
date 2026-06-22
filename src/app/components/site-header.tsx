import Link from "next/link";
import type { NavItem, SiteConfig } from "@/lib/content";
import { SearchForm } from "./search-form";
import { t } from "@/lib/i18n";

interface SiteHeaderProps {
  config: SiteConfig;
}

export function SiteHeader({ config }: SiteHeaderProps) {
  const headerImage = config.theme?.headerImage;
  const showTagline = config.theme?.showTagline === true;
  const isCenter = config.theme?.headerLayout === "center";
  const loc = config.language;

  // Inline style for header background image when set.
  // Consume the --header-image CSS var (emitted by buildThemeCssVars) rather
  // than embedding the raw URL here — the escaping is handled at CSS-var emit
  // time, and using var() avoids a second injection surface.
  const headerStyle: React.CSSProperties | undefined = headerImage
    ? {
        backgroundImage: "var(--header-image)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  if (isCenter) {
    // Center layout: title stacked above nav, both centered.
    return (
      <header
        className="border-b border-zinc-200 dark:border-zinc-800 bg-[var(--color-header-bg,#f4f4f5)] dark:bg-[var(--color-header-bg,#18181b)]"
        style={headerStyle}
      >
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-4 flex flex-col items-center gap-2">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight [color:var(--color-header-text,#18181b)] dark:[color:var(--color-header-text,#fafafa)] hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            {config.theme?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={config.theme.logo}
                alt={config.title}
                className="h-8 w-auto object-contain"
              />
            ) : (
              config.title
            )}
          </Link>
          {showTagline && config.description ? (
            <p className="text-sm [color:var(--color-header-text,#71717a)] dark:[color:var(--color-header-text,#a1a1aa)]">{config.description}</p>
          ) : null}
          <nav aria-label={t(loc, "common.mainNav")}>
            <ul className="flex items-center gap-6">
              {config.nav.map((item: NavItem, i: number) =>
                item.children && item.children.length > 0 ? (
                  <li key={`${i}-${item.href}`} className="group relative">
                    <Link
                      href={item.href}
                      className="text-sm [color:var(--color-header-text,#52525b)] dark:[color:var(--color-header-text,#a1a1aa)] hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                      aria-haspopup="menu"
                    >
                      {item.label}
                    </Link>
                    <ul
                      role="menu"
                      className="absolute left-0 top-full hidden group-hover:block group-focus-within:block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-md min-w-[160px] py-1 z-10"
                    >
                      {item.children.map((child, ci: number) => (
                        <li key={`${ci}-${child.href}`} role="menuitem">
                          <Link
                            href={child.href}
                            className="block px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : (
                  <li key={`${i}-${item.href}`}>
                    <Link
                      href={item.href}
                      className="text-sm [color:var(--color-header-text,#52525b)] dark:[color:var(--color-header-text,#a1a1aa)] hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </nav>
          <div className="w-40 shrink-0">
            <SearchForm locale={loc} />
          </div>
        </div>
      </header>
    );
  }

  // Left layout (default): title left, nav + search right.
  return (
    <header
      className="border-b border-zinc-200 dark:border-zinc-800 bg-[var(--color-header-bg,#f4f4f5)] dark:bg-[var(--color-header-bg,#18181b)]"
      style={headerStyle}
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex flex-col justify-center">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight [color:var(--color-header-text,#18181b)] dark:[color:var(--color-header-text,#fafafa)] hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              {config.theme?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.theme.logo}
                  alt={config.title}
                  className="h-8 w-auto object-contain"
                />
              ) : (
                config.title
              )}
            </Link>
            {showTagline && config.description ? (
              <p className="text-xs [color:var(--color-header-text,#71717a)] dark:[color:var(--color-header-text,#a1a1aa)] leading-tight mt-0.5">
                {config.description}
              </p>
            ) : null}
          </div>
          <nav aria-label={t(loc, "common.mainNav")}>
            <ul className="flex items-center gap-6">
              {config.nav.map((item: NavItem, i: number) =>
                item.children && item.children.length > 0 ? (
                  <li key={`${i}-${item.href}`} className="group relative">
                    <Link
                      href={item.href}
                      className="text-sm [color:var(--color-header-text,#52525b)] dark:[color:var(--color-header-text,#a1a1aa)] hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                      aria-haspopup="menu"
                    >
                      {item.label}
                    </Link>
                    <ul
                      role="menu"
                      className="absolute left-0 top-full hidden group-hover:block group-focus-within:block bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-md min-w-[160px] py-1 z-10"
                    >
                      {item.children.map((child, ci: number) => (
                        <li key={`${ci}-${child.href}`} role="menuitem">
                          <Link
                            href={child.href}
                            className="block px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : (
                  <li key={`${i}-${item.href}`}>
                    <Link
                      href={item.href}
                      className="text-sm [color:var(--color-header-text,#52525b)] dark:[color:var(--color-header-text,#a1a1aa)] hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </nav>
          <div className="w-40 shrink-0">
            <SearchForm locale={loc} />
          </div>
        </div>
      </div>
    </header>
  );
}
