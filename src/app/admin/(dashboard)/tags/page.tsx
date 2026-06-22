// Tags admin list — server component.
// NO 'use cache' — verifySession() reads cookies (forces dynamic rendering, D11).
// Suspense + inner async pattern mirrors categories/page.tsx.

import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { AdminPageHeader } from "../_components/admin-page-header";
import { createTagAction } from "./actions";
import { TagCreateForm } from "./tag-create-form";

async function TagsContent() {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const tags = await getRepository().listTags();

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.taxonomy.tagsTitle")} />
      {tags.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.taxonomy.noTags")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.taxonomy.colLabel")}</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.taxonomy.colSlug")}</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.taxonomy.colDescription")}</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.taxonomy.colPosts")}</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.taxonomy.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.slug} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">{tag.label}</td>
                <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">{tag.slug}</td>
                <td className="py-2 px-3 text-zinc-500 dark:text-zinc-400 text-xs">{tag.description ?? ""}</td>
                <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">{tag.count}</td>
                <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">
                  <a
                    href={`/admin/tags/${tag.slug}/rename`}
                    className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
                  >
                    {t(loc, "admin.taxonomy.rename")}
                  </a>
                  {" · "}
                  <a
                    href={`/admin/tags/${tag.slug}/merge`}
                    className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
                  >
                    {t(loc, "admin.taxonomy.merge")}
                  </a>
                  {" · "}
                  <a
                    href={`/admin/tags/${tag.slug}/delete`}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
                  >
                    {t(loc, "admin.taxonomy.deleteHeading")}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">{t(loc, "admin.taxonomy.addTag")}</h2>
        <TagCreateForm action={createTagAction} />
      </div>
      <p className="mt-6">
        <a href="/admin" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.taxonomy.backToAdmin")}</a>
      </p>
    </div>
  );
}

export default function TagsPage() {
  return (
    <Suspense fallback={<p>Loading tags…</p>}>
      <TagsContent />
    </Suspense>
  );
}
