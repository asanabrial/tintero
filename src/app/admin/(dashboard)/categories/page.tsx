// Categories admin list — server component.
// NO 'use cache' — verifySession() reads cookies (forces dynamic rendering, D11).
// Suspense + inner async pattern mirrors users/page.tsx.

import { Suspense } from "react";
import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { filterAndPaginateTerms } from "@/lib/admin/paginate-terms";
import { AdminPageHeader } from "../_components/admin-page-header";
import { createCategoryAction } from "./actions";
import { CategoryCreateForm } from "./category-create-form";
import { CategoriesSearchForm } from "./_components/categories-search-form";
import { buildCategoriesListHref } from "./_components/build-categories-list-href";

const PAGE_SIZE = 20;

async function CategoriesContent({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const params = await searchParams;
  const requestedPage = parseInt(params.page ?? "1", 10) || 1;
  const q = (params.q ?? "").trim();

  const allCategories = await getRepository().listCategories();

  const { items: pageCategories, total: filteredCount, totalPages, page: safePage } =
    filterAndPaginateTerms(allCategories, { query: q, page: requestedPage, pageSize: PAGE_SIZE });

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.taxonomy.categoriesTitle")} />

      {(filteredCount > 0 || q !== "") && <CategoriesSearchForm q={q} loc={loc} />}

      {q !== "" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          {t(loc, "admin.taxonomy.searchResultsFor", { q, count: filteredCount })}{" "}
          <Link href={buildCategoriesListHref({})} className="underline">
            {t(loc, "admin.taxonomy.clearSearch")}
          </Link>
        </p>
      )}

      {pageCategories.length === 0 ? (
        q !== "" ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.taxonomy.noCategoriesMatch", { q })}</p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.taxonomy.noCategories")}</p>
        )
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
            {pageCategories.map((cat) => (
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

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between mt-4 text-sm"
          aria-label={t(loc, "common.pagination")}
        >
          {safePage > 1 ? (
            <Link href={buildCategoriesListHref({ q, page: safePage - 1 })} className="underline" rel="prev">
              {t(loc, "common.previous")}
            </Link>
          ) : (
            <span className="text-zinc-400" aria-hidden>
              {t(loc, "common.previous")}
            </span>
          )}
          <span className="text-zinc-500 dark:text-zinc-400">
            {t(loc, "common.page", { page: safePage, total: totalPages })}
          </span>
          {safePage < totalPages ? (
            <Link href={buildCategoriesListHref({ q, page: safePage + 1 })} className="underline" rel="next">
              {t(loc, "common.next")}
            </Link>
          ) : (
            <span className="text-zinc-400" aria-hidden>
              {t(loc, "common.next")}
            </span>
          )}
        </nav>
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

export default function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  return (
    <Suspense fallback={<p>{""}</p>}>
      <CategoriesContent searchParams={searchParams} />
    </Suspense>
  );
}
