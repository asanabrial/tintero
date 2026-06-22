// Admin pages list page — server component.
// The dynamic content (which reads cookies via verifySession) is wrapped in
// <Suspense> as required by Next.js 16 cacheComponents mode.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import Link from "next/link";
import { ButtonLink } from "@/app/components/ui/button";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { clampPage } from "@/lib/content";
import { t } from "@/lib/i18n";
import { AdminPageHeader } from "../_components/admin-page-header";
import { PagesTable } from "./_components/pages-table";
import { PagesSearchForm } from "./_components/pages-search-form";
import { buildPagesListHref } from "./_components/build-pages-list-href";
import { bulkDeletePagesAction, bulkSetPageStatusAction, quickUpdatePageAction } from "./actions";

const PAGE_SIZE = 20;

async function PagesListContent({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const session = await verifySession();
  if (!can(session.role, "pages:edit")) redirect("/admin");
  const { language: loc } = await getLayoutSiteConfig();
  const params = await searchParams;
  const requestedPage = parseInt(params.page ?? "1", 10) || 1;
  const q = (params.q ?? "").trim();
  const queryOpt = q !== "" ? { query: q } : {};

  let pagesResult = await getRepository().listPages({
    page: requestedPage,
    pageSize: q !== "" ? 9999 : PAGE_SIZE,
    includeDrafts: true,
    ...queryOpt,
  });

  const safePage = clampPage(requestedPage, pagesResult.totalPages);
  if (safePage !== requestedPage) {
    pagesResult = await getRepository().listPages({
      page: safePage,
      pageSize: q !== "" ? 9999 : PAGE_SIZE,
      includeDrafts: true,
      ...queryOpt,
    });
  }

  const { pages, total, totalPages } = pagesResult;

  return (
    <div>
      <AdminPageHeader
        title={t(loc, "admin.pages.title")}
        actionHref="/admin/pages/new"
        actionLabel={t(loc, "admin.pages.addNew")}
      />
      <div className="flex items-center justify-end mb-2">
        <ButtonLink href="/admin/pages/trash" variant="link">
          {t(loc, "admin.pages.viewTrash")}
        </ButtonLink>
      </div>
      {(total > 0 || q !== "") && <PagesSearchForm q={q} locale={loc} />}
      {q !== "" && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
          {t(loc, "admin.pages.searchResultsFor", { q, count: total })}{" "}
          <Link href={buildPagesListHref({})} className="underline">
            {t(loc, "admin.pages.clearSearch")}
          </Link>
        </p>
      )}
      {pages.length === 0 ? (
        q !== "" ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t(loc, "admin.pages.noPagesFound", { q })}
          </p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t(loc, "admin.pages.noPagesYet")}{" "}
            <Link
              href="/admin/pages/new"
              className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
            >
              {t(loc, "admin.pages.createOne")}
            </Link>
          </p>
        )
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 text-right mb-1">{total} item(s)</p>
          <PagesTable pages={pages} bulkDeleteAction={bulkDeletePagesAction} bulkSetStatusAction={bulkSetPageStatusAction} quickEditAction={quickUpdatePageAction} />
        </>
      )}

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between mt-4 text-sm"
          aria-label={t(loc, "common.pagination")}
        >
          {safePage > 1 ? (
            <Link
              href={buildPagesListHref({ q, page: safePage - 1 })}
              className="underline"
              rel="prev"
            >
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
            <Link
              href={buildPagesListHref({ q, page: safePage + 1 })}
              className="underline"
              rel="next"
            >
              {t(loc, "common.next")}
            </Link>
          ) : (
            <span className="text-zinc-400" aria-hidden>
              {t(loc, "common.next")}
            </span>
          )}
        </nav>
      )}
    </div>
  );
}

export default function AdminPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <PagesListContent searchParams={searchParams} />
    </Suspense>
  );
}
