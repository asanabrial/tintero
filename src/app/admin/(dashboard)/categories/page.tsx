// Categories admin list — server component.
// NO 'use cache' — verifySession() reads cookies (forces dynamic rendering, D11).
// Suspense + inner async pattern mirrors posts/page.tsx and users/page.tsx.

import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { AdminPageHeader } from "../_components/admin-page-header";
import { createCategoryAction } from "./actions";
import { CategoryCreateForm } from "./category-create-form";

async function CategoriesContent() {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const categories = await getRepository().listCategories();

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.taxonomy.categoriesTitle")} />
      {categories.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.taxonomy.noCategories")}</p>
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
            {categories.map((cat) => (
              <tr key={cat.slug} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">{cat.label}</td>
                <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">{cat.slug}</td>
                <td className="py-2 px-3 text-zinc-500 dark:text-zinc-400 text-xs">{cat.description ?? ""}</td>
                <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">{cat.count}</td>
                <td className="py-2 px-3 text-zinc-700 dark:text-zinc-300">
                  <a
                    href={`/admin/categories/${cat.slug}/rename`}
                    className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
                  >
                    {t(loc, "admin.taxonomy.rename")}
                  </a>
                  {" · "}
                  <a
                    href={`/admin/categories/${cat.slug}/merge`}
                    className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
                  >
                    {t(loc, "admin.taxonomy.merge")}
                  </a>
                  {" · "}
                  <a
                    href={`/admin/categories/${cat.slug}/delete`}
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
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">{t(loc, "admin.taxonomy.addCategory")}</h2>
        <CategoryCreateForm action={createCategoryAction} />
      </div>
      <p className="mt-6">
        <a href="/admin" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.taxonomy.backToAdmin")}</a>
      </p>
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<p>Loading categories…</p>}>
      <CategoriesContent />
    </Suspense>
  );
}
