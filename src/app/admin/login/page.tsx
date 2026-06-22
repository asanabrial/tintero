// Login page — public, no auth gate.
// Unauthenticated users must be able to reach this page.
// Already-authenticated users are redirected by proxy (Layer 1).
//
// Next.js 16 with cacheComponents: true requires:
// 1. await connection() as the FIRST await inside the async content component,
//    to opt into request-time rendering before any DB I/O.
// 2. The async content wrapped in <Suspense> so Next.js can render a static
//    shell at build time and stream the dynamic content at request time.
//
// getSetupState() calls getUserRepository() which throws if DATABASE_URL is
// missing — the connection() call + Suspense boundary ensures this NEVER runs
// at build time.

import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSetupState } from "@/lib/install/probes";
import { getLayoutSiteConfig } from "@/lib/content";
import { resolveLocale, t } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/i18n/provider";
import { LoginForm } from "./login-form";

/**
 * Async server component: checks setup state and either redirects to /install
 * or renders the login card. Must be inside <Suspense> so Next.js 16
 * cacheComponents doesn't prerender uncached async work at build time.
 *
 * await connection() MUST be the FIRST await — it signals to Next.js that all
 * subsequent async work is request-time-only (never prerendered at build).
 */
async function LoginContent() {
  // CRITICAL: opt into request-time rendering before any DB I/O.
  await connection();

  const [state, config] = await Promise.all([getSetupState(), getLayoutSiteConfig()]);
  if (state !== "complete") {
    redirect("/install");
  }
  const locale = resolveLocale(config.language);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t(locale, "admin.login.title")}</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t(locale, "admin.login.subtitle")}</p>
          </div>
          <LocaleProvider locale={locale}>
            <LoginForm />
          </LocaleProvider>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950" />
      }
    >
      <LoginContent />
    </Suspense>
  );
}
