import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLayoutSiteConfig } from "@/lib/content";
import { buildSiteGraph } from "@/lib/jsonld";
import { buildThemeCssVars, sanitizeCustomCss, themeColorScheme } from "@/lib/content/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const config = await getLayoutSiteConfig();
  return {
    title: {
      default: config.title,
      template: `%s | ${config.title}`,
    },
    description: config.description,
    metadataBase: new URL(config.baseUrl),
    ...(config.theme?.favicon ? { icons: { icon: config.theme.favicon } } : {}),
    alternates: {
      types: {
        "application/rss+xml": [{ url: "/feed.xml", title: `${config.title} — RSS` }],
        "application/atom+xml": [{ url: "/feed.xml/atom", title: `${config.title} — Atom` }],
      },
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Use the static-cached config for the layout shell — avoids uncached I/O
  // outside Suspense (which would break PPR and static prerender for dynamic routes).
  // getLayoutSiteConfig() is 'use cache' -keyed with a stable constant — safe in shell.
  const config = await getLayoutSiteConfig();
  const base = config.baseUrl.replace(/\/$/, "");
  const themeCss =
    buildThemeCssVars(config.theme) + sanitizeCustomCss(config.theme?.customCss);
  // When a page background is set, make its implied scheme authoritative for all
  // visitors (overrides their OS dark-mode preference). Undefined ⇒ omit the
  // attribute so the site follows prefers-color-scheme as before.
  const colorScheme = themeColorScheme(config.theme);

  return (
    // suppressHydrationWarning: the admin color-scheme boot script re-applies
    // `data-color-scheme` on <html> before React hydrates (to avoid a theme
    // flash), so this attribute can legitimately differ from the server-rendered
    // value. Suppressing the warning is the standard pattern for theme scripts;
    // it only affects this element's own attributes, one level deep.
    <html
      lang={config.language}
      data-color-scheme={colorScheme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {themeCss !== "" && (
          <style dangerouslySetInnerHTML={{ __html: themeCss }} />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildSiteGraph(config, base)),
          }}
        />
        {children}
      </body>
    </html>
  );
}
