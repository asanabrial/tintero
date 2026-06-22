// Admin posts list page — server component.
// The dynamic content (which reads cookies via verifySession) is wrapped in
// <Suspense> as required by Next.js 16 cacheComponents mode.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import Link from "next/link";
import { ButtonLink } from "@/app/components/ui/button";
import { verifySession } from "@/lib/auth/dal";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import type { AdminStatus, StatusCounts } from "@/lib/content";
import { clampPage } from "@/lib/content";
import { getCommentRepository } from "@/lib/comments";
import { postReadabilityScore, postSeoScore } from "@/lib/seo/post-score";
import type { AssessmentScore } from "@/lib/seo/analysis";
import { t } from "@/lib/i18n";
import { AdminPageHeader } from "../_components/admin-page-header";
import { PostsTable } from "./_components/posts-table";
import { PostsSearchForm } from "./_components/posts-search-form";
import { buildPostsListHref } from "./_components/build-posts-list-href";
import { bulkDeletePostsAction, bulkSetPostStatusAction, quickUpdatePostAction } from "./actions";

const PAGE_SIZE = 20;

function parseAdminStatus(raw: string | string[] | undefined): AdminStatus | undefined {
  return raw === "published" || raw === "draft" || raw === "scheduled" ? raw : undefined;
}

async function PostsListContent({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();
  const now = new Date().toISOString().slice(0, 10);
  const params = await searchParams;
  const adminStatus = parseAdminStatus(params.status);
  const requestedPage = parseInt(params.page ?? "1", 10) || 1;
  const q = (params.q ?? "").trim();

  // EMPTY-QUERY WIPE GUARD: only pass `query` when q is non-empty.
  // Passing query:"" to listPosts causes the adapter to return [] (wipes the list).
  const queryOpt = q !== "" ? { query: q } : {};

  const counts = await getRepository().listPostStatusCounts(now);
  let result = await getRepository().listPosts({
    includeDrafts: true,
    adminStatus,
    now,
    page: requestedPage,
    pageSize: PAGE_SIZE,
    ...queryOpt,
  });

  const safePage = clampPage(requestedPage, result.totalPages);
  if (safePage !== requestedPage) {
    result = await getRepository().listPosts({
      includeDrafts: true,
      adminStatus,
      now,
      page: safePage,
      pageSize: PAGE_SIZE,
      ...queryOpt,
    });
  }

  const { posts, total, totalPages } = result;
  const activeKey: AdminStatus | "all" = adminStatus ?? "all";

  // Approved-comment counts for the listed posts (WP comment-bubble column).
  // Best-effort: a missing DATABASE_URL or comments outage just hides the bubbles.
  let commentCounts: Record<string, number> = {};
  try {
    commentCounts = await getCommentRepository().countApprovedBySlugs(
      posts.map((p) => p.slug)
    );
  } catch {
    commentCounts = {};
  }

  // Per-post SEO bullet for the Yoast-style "SEO" column (null = no keyphrase).
  const seoScores: Record<string, AssessmentScore | null> = Object.fromEntries(
    posts.map((p) => [p.slug, postSeoScore(p)])
  );
  // Per-post readability bullet (Yoast's second list column).
  const readabilityScores: Record<string, AssessmentScore> = Object.fromEntries(
    posts.map((p) => [p.slug, postReadabilityScore(p)])
  );

  const TABS: { key: AdminStatus | "all"; label: string; countKey: keyof StatusCounts }[] = [
    { key: "all", label: t(loc, "admin.posts.tabAll"), countKey: "all" },
    { key: "published", label: t(loc, "admin.posts.tabPublished"), countKey: "published" },
    { key: "draft", label: t(loc, "admin.posts.tabDraft"), countKey: "draft" },
    { key: "scheduled", label: t(loc, "admin.posts.tabScheduled"), countKey: "scheduled" },
  ];

  return (
    <div>
      <AdminPageHeader
        title={t(loc, "admin.posts.title")}
        actionHref="/admin/posts/new"
        actionLabel={t(loc, "admin.posts.addNew")}
      />

      <div className="flex items-center justify-end mb-2">
        <ButtonLink href="/admin/posts/trash" variant="link">
          {t(loc, "admin.posts.viewTrash")}
        </ButtonLink>
      </div>

      <nav
        className="flex gap-4 text-sm mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2"
        aria-label={t(loc, "admin.posts.filterByStatus")}
      >
        {TABS.map((tab) => {
          const isActive = activeKey === tab.key;
          return (
            <Link
              key={tab.key}
              href={buildPostsListHref({ status: tab.key, q, page: 1 })}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "font-semibold text-blue-700 dark:text-blue-400"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
              }
            >
              {tab.label} <span className="tabular-nums">({counts[tab.countKey]})</span>
            </Link>
          );
        })}
      </nav>

      <PostsSearchForm status={activeKey} q={q} locale={loc} />

      {q !== "" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
          {t(loc, "admin.posts.searchResultsFor", { q, count: total })}{" "}
          <Link
            href={buildPostsListHref({ status: activeKey })}
            className="underline"
          >
            {t(loc, "admin.posts.clearSearch")}
          </Link>
        </p>
      )}

      {posts.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          {q !== ""
            ? t(loc, "admin.posts.noPostsFound", { q })
            : t(loc, "admin.posts.empty")}
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 text-right mb-1">{total} item(s)</p>
          <PostsTable posts={posts} now={now} commentCounts={commentCounts} seoScores={seoScores} readabilityScores={readabilityScores} bulkDeleteAction={bulkDeletePostsAction} bulkSetStatusAction={bulkSetPostStatusAction} quickEditAction={quickUpdatePostAction} />
        </>
      )}

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between mt-4 text-sm"
          aria-label={t(loc, "common.pagination")}
        >
          {safePage > 1 ? (
            <Link href={buildPostsListHref({ status: activeKey, q, page: safePage - 1 })} className="underline" rel="prev">
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
            <Link href={buildPostsListHref({ status: activeKey, q, page: safePage + 1 })} className="underline" rel="next">
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

export default function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <PostsListContent searchParams={searchParams} />
    </Suspense>
  );
}
