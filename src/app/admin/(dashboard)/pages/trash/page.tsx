// Admin pages trash page — server component.
// NO 'use cache' directive — calls verifySession() which reads cookies.
import { Suspense } from "react";
import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { getPageWriter, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { restorePageAction, permanentlyDeletePageAction } from "../actions";

async function PagesTrashContent() {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const trashedPages = await getPageWriter().listTrashedPages();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t(loc, "admin.trash.title")}
        </h1>
        <Link href="/admin/pages" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">
          {t(loc, "admin.trash.backToPages")}
        </Link>
      </div>
      {trashedPages.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t(loc, "admin.trash.emptyPages")}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {trashedPages.map((page) => (
            <li key={page.slug} className="py-3 flex items-center justify-between gap-4">
              <div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{page.title}</span>
                <span className="ml-2 text-xs text-zinc-400 font-mono">{page.slug}</span>
                <span className="ml-2 text-xs text-zinc-400">{page.date}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <form action={restorePageAction.bind(null, page.slug)}>
                  <button type="submit" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">
                    {t(loc, "admin.trash.restore")}
                  </button>
                </form>
                <form action={permanentlyDeletePageAction.bind(null, page.slug)}>
                  <button type="submit" className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline">
                    {t(loc, "admin.common.deletePermanently")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {trashedPages.length > 0 && (
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          {t(loc, "admin.trash.note")}
        </p>
      )}
    </div>
  );
}

export default function AdminPagesTrashPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PagesTrashContent />
    </Suspense>
  );
}
