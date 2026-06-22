// Admin Redirects manager — server component (Yoast-style redirect list).
// NO 'use cache' — reads the session and the live redirects file dynamically.

import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { loadRedirects } from "@/lib/seo/redirect-store";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";
import { AdminPageHeader } from "../_components/admin-page-header";
import { Button } from "@/app/components/ui/button";
import { addRedirectAction, deleteRedirectAction } from "./actions";

const INPUT_CLASS =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

async function RedirectsContent() {
  const session = await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  if (!can(session.role, "settings:manage")) {
    return <p className="text-zinc-600 dark:text-zinc-400">{t(loc, "admin.redirects.permissionError")}</p>;
  }

  const rules = await loadRedirects();

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.redirects.title")} />
      <p className="mb-6 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        {t(loc, "admin.redirects.intro")}
      </p>

      {rules.length === 0 ? (
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">{t(loc, "admin.redirects.empty")}</p>
      ) : (
        <div className="mb-8 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/40">
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t(loc, "admin.redirects.colFrom")}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t(loc, "admin.redirects.colTo")}</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t(loc, "admin.redirects.colType")}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.from} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                  <td className="px-3 py-2.5 align-top">
                    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">{rule.from}</code>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">{rule.to}</code>
                  </td>
                  <td className="px-3 py-2.5 align-top text-zinc-600 dark:text-zinc-400">
                    {rule.permanent ? t(loc, "admin.redirects.typePermanent") : t(loc, "admin.redirects.typeTemporary")}
                  </td>
                  <td className="px-3 py-2.5 align-top text-right">
                    <form action={deleteRedirectAction}>
                      <input type="hidden" name="from" value={rule.from} />
                      <Button type="submit" variant="danger" size="sm">{t(loc, "admin.common.delete")}</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">{t(loc, "admin.redirects.addRedirect")}</h2>
      <form action={addRedirectAction} className="max-w-2xl space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            {t(loc, "admin.redirects.fromLabel")}
            <input name="from" type="text" required placeholder="/old-url" className={INPUT_CLASS} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            {t(loc, "admin.redirects.toLabel")}
            <input name="to" type="text" required placeholder="/blog/new-url" className={INPUT_CLASS} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" name="permanent" defaultChecked />
          {t(loc, "admin.redirects.permanentLabel")}
        </label>
        <Button type="submit" variant="accent" size="sm">{t(loc, "admin.redirects.addRedirect")}</Button>
      </form>
    </div>
  );
}

export default function AdminRedirectsPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <RedirectsContent />
    </Suspense>
  );
}
