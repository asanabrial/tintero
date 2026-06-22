// Install wizard page — server component.
// NO "use client". NO export const dynamic.
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
import { DatabaseStep } from "./database-step";
import { SchemaStep } from "./schema-step";
import { AuthSecretStep } from "./auth-secret-step";
import { CreateSiteForm } from "./create-site-form";

/**
 * Centered zinc/dark card shell — mirrors /admin/login layout.
 */
function Shell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className={`w-full ${wide ? "max-w-md" : "max-w-sm"}`}>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Async server component: runs the setup probe and renders the correct step.
 * Must be inside <Suspense> so Next.js 16 cacheComponents doesn't try to
 * prerender this uncached async work at build time.
 *
 * await connection() MUST be the FIRST await — it signals to Next.js that all
 * subsequent async work is request-time-only (never prerendered at build).
 */
async function InstallContent() {
  // CRITICAL: opt into request-time rendering before any DB I/O.
  // Without this, getSetupState() can be called during build prerender,
  // which throws when DATABASE_URL is absent.
  await connection();

  const state = await getSetupState();

  switch (state) {
    case "complete":
      redirect("/admin/login");
      break; // redirect() throws NEXT_REDIRECT — unreachable
    case "db-unreachable":
      return (
        <Shell>
          <DatabaseStep />
        </Shell>
      );
    case "schema-not-ready":
      return (
        <Shell>
          <SchemaStep />
        </Shell>
      );
    case "needs-admin":
      if (!process.env.AUTH_SECRET) {
        return (
          <Shell>
            <AuthSecretStep />
          </Shell>
        );
      }
      return (
        <Shell wide>
          <CreateSiteForm />
        </Shell>
      );
  }
}

export default function InstallPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Checking setup…</p>
        </div>
      }
    >
      <InstallContent />
    </Suspense>
  );
}
