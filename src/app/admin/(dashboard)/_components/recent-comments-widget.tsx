// RecentCommentsWidget — async server component.
// Renders the 5 most recent comments (all statuses) for moderators.
// Each row links to /admin/comments. Degrades gracefully when DB is unavailable.

import Link from "next/link";
import { getCommentRepository } from "@/lib/comments";
import { toRecentCommentView } from "@/lib/comments/recent-comment-view";
import type { RecentCommentView } from "@/lib/comments/recent-comment-view";
import type { CommentStatus } from "@/lib/comments/types";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";

// ----------------------------------------------------------------
// Sub-components defined at module level (rerender-no-inline-components).
// No boolean props — each is a single-purpose presentational unit.
// ----------------------------------------------------------------

function StatusBadge({ status }: { status: CommentStatus }) {
  const styles: Record<CommentStatus, string> = {
    approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    spam: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    trash: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function RecentCommentRow({ view }: { view: RecentCommentView }) {
  return (
    <Link
      href="/admin/comments"
      className="flex flex-col gap-1 rounded-md px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
          {view.authorName}
        </span>
        <StatusBadge status={view.status} />
        <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
          {view.postSlug}
        </span>
      </div>
      {view.excerpt && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
          {view.excerpt}
        </p>
      )}
    </Link>
  );
}

// ----------------------------------------------------------------
// Main async server component
// ----------------------------------------------------------------

export async function RecentCommentsWidget() {
  let views: RecentCommentView[] = [];
  let degraded = false;

  try {
    const { comments } = await getCommentRepository().listByStatus("all", 1, 5);
    views = comments.map(toRecentCommentView);
  } catch {
    degraded = true;
  }
  const { language: loc } = await getLayoutSiteConfig();

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t(loc, "admin.recentComments.title")}</h3>
        <Link
          href="/admin/comments"
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
        >
          {t(loc, "admin.common.viewAll")}
        </Link>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {degraded ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
            {t(loc, "admin.recentComments.unavailable")}
          </p>
        ) : views.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
            {t(loc, "admin.recentComments.empty")}
          </p>
        ) : (
          views.map((view) => (
            <RecentCommentRow key={view.id} view={view} />
          ))
        )}
      </div>
    </div>
  );
}
