// Admin Tools page — server component.
// verifySession() is called FIRST inside the inner async component.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";
import { ImportForm } from "./import-form";
import { WxrImportForm } from "./wxr-import-form";
import { importAction, wxrImportAction } from "./actions";
import { AdminPageHeader } from "../_components/admin-page-header";
import { ButtonLink } from "@/app/components/ui/button";

async function ToolsContent() {
  // AUTH GUARD — must be first
  const session = await verifySession();
  if (!can(session.role, "tools:access")) redirect("/admin");
  const { language: loc } = await getLayoutSiteConfig();

  return (
    <div className="space-y-10">
      <AdminPageHeader title={t(loc, "admin.tools.title")} />

      {/* Export section */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {t(loc, "admin.tools.exportHeading")}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t(loc, "admin.tools.exportIntro")}
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/api/v1/export" download variant="accent">
            {t(loc, "admin.tools.downloadExport")}
          </ButtonLink>
          <ButtonLink href="/api/v1/export/wxr" download variant="secondary">
            {t(loc, "admin.tools.downloadWxr")}
          </ButtonLink>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t(loc, "admin.tools.wxrNote")}
        </p>
      </section>

      {/* Import section */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {t(loc, "admin.tools.importHeading")}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t(loc, "admin.tools.importIntro")}
        </p>
        <ImportForm action={importAction} />
      </section>

      {/* WXR Import section */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {t(loc, "admin.tools.wxrImportHeading")}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t(loc, "admin.tools.wxrImportIntro")}
        </p>
        <WxrImportForm action={wxrImportAction} />
      </section>
    </div>
  );
}

export default function AdminToolsPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ToolsContent />
    </Suspense>
  );
}
