// Admin comments moderation page — server component.
// Dynamic content (reads cookies via verifySession) is wrapped in <Suspense>
// as required by Next.js 16 cacheComponents mode. NO 'use cache'.

import { Suspense } from "react";
import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { getCommentRepository } from "@/lib/comments";
import { parseCommentStatus } from "@/lib/comments";
import type { Comment, CommentStatus, CommentStatusCounts } from "@/lib/comments";
import { AdminPageHeader } from "../_components/admin-page-header";
import { CommentsTable } from "./_components/comments-table";
import { bulkCommentAction } from "./actions";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";

const PAGE_SIZE = 20;

async function CommentsContent({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();
  const params = await searchParams;
  const status = parseCommentStatus(params.status);
  const requestedPage = parseInt(params.page ?? "1", 10) || 1;

  const TABS: { key: CommentStatus | "all"; label: string; countKey: keyof CommentStatusCounts }[] = [
    { key: "all", label: t(loc, "admin.comments.tabAll"), countKey: "all" },
    { key: "pending", label: t(loc, "admin.comments.tabPending"), countKey: "pending" },
    { key: "approved", label: t(loc, "admin.comments.tabApproved"), countKey: "approved" },
    { key: "spam", label: t(loc, "admin.comments.tabSpam"), countKey: "spam" },
    { key: "trash", label: t(loc, "admin.comments.tabTrash"), countKey: "trash" },
  ];

  let counts: CommentStatusCounts = { all: 0, pending: 0, approved: 0, spam: 0, trash: 0 };
  let comments: Comment[] = [];
  let total = 0;
  let totalPages = 0;
  let dbError = false;

  try {
    const repo = getCommentRepository();
    counts = await repo.countsByStatus();
    const result = await repo.listByStatus(status ?? "all", requestedPage, PAGE_SIZE);
    comments = result.comments;
    total = result.total;
    totalPages = result.totalPages;
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <div>
        <AdminPageHeader title={t(loc, "admin.comments.title")} />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.comments.unavailable")}</p>
      </div>
    );
  }

  const safePage = Math.max(1, Math.min(requestedPage, Math.max(totalPages, 1)));
  const activeKey: CommentStatus | "all" = status ?? "all";
  const isTrashView = activeKey === "trash";

  const qs = (s: CommentStatus | "all", page: number) => {
    const sp = new URLSearchParams();
    if (s !== "all") sp.set("status", s);
    if (page > 1) sp.set("page", String(page));
    const str = sp.toString();
    return str ? `?${str}` : "/admin/comments";
  };

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.comments.title")} />

      <nav
        className="flex gap-4 text-sm mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2"
        aria-label={t(loc, "admin.comments.filterByStatus")}
      >
        {TABS.map((tab) => {
          const isActive = activeKey === tab.key;
          return (
            <Link
              key={tab.key}
              href={qs(tab.key, 1)}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "font-semibold text-zinc-900 dark:text-zinc-50"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
              }
            >
              {tab.label} <span className="tabular-nums">({counts[tab.countKey]})</span>
            </Link>
          );
        })}
      </nav>

      {comments.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.comments.empty")}</p>
      ) : (
        <CommentsTable comments={comments} bulkCommentAction={bulkCommentAction} isTrashView={isTrashView} />
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between mt-4 text-sm" aria-label={t(loc, "common.pagination")}>
          {safePage > 1 ? (
            <Link href={qs(activeKey, safePage - 1)} className="underline" rel="prev">
              {t(loc, "common.previous")}
            </Link>
          ) : (
            <span className="text-zinc-400" aria-hidden>
              {t(loc, "common.previous")}
            </span>
          )}
          <span className="text-zinc-500 dark:text-zinc-400">
            {t(loc, "common.page", { page: safePage, total: totalPages })} ({total})
          </span>
          {safePage < totalPages ? (
            <Link href={qs(activeKey, safePage + 1)} className="underline" rel="next">
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

export default function AdminCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <CommentsContent searchParams={searchParams} />
    </Suspense>
  );
}
