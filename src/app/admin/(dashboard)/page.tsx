// Admin home page — server component.
// The dynamic content (which reads cookies via verifySession) is wrapped in
// <Suspense> as required by Next.js 16 cacheComponents mode.

import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { AdminPageHeader } from "./_components/admin-page-header";
import { ButtonLink } from "@/app/components/ui/button";
import { getRepository } from "@/lib/content";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";
import { splitPostsByStatus } from "@/lib/content/dashboard";
import { getCommentRepository } from "@/lib/comments";
import { getUserRepository } from "@/lib/auth";
import { listUploads } from "@/lib/media/fs-media";
import { UPLOADS_DIR } from "@/lib/media/dir";
import { RecentCommentsWidget } from "./_components/recent-comments-widget";
import { QuickDraftForm } from "./_components/quick-draft-form";
import { createQuickDraftAction } from "./posts/actions";

// Presentational tile — no boolean props (composition-patterns: architecture-avoid-boolean-props).
// Defined at module level, NOT inside AdminContent (rerender-no-inline-components).
// Static tone → accent-bar color (Tailwind v4 needs literal class names). Using
// a `before:` bar avoids the border-shorthand overriding a border-left color.
const STAT_TONES = {
  emerald: "before:bg-emerald-500",
  amber: "before:bg-amber-500",
  sky: "before:bg-sky-500",
  violet: "before:bg-violet-500",
  cyan: "before:bg-cyan-500",
  rose: "before:bg-rose-500",
  blue: "before:bg-blue-500",
} as const;

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: keyof typeof STAT_TONES;
}) {
  return (
    <div
      className={`relative flex flex-col gap-1 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 pl-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 before:absolute before:inset-y-0 before:left-0 before:w-1 ${STAT_TONES[tone]}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

// Skeleton card shown while a widget Suspense boundary is streaming.
// Defined at module level (rerender-no-inline-components).
function WidgetSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 animate-pulse">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4" />
        <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2" />
      </div>
    </div>
  );
}

async function AdminContent() {
  // Auth gate — must be first; redirects to /admin/login on failure (forces dynamic rendering).
  // Bind the session so we can derive per-widget RBAC caps below.
  const session = await verifySession();
  const canModerate = can(session.role, "comments:moderate");
  const canCreate = can(session.role, "posts:create");

  // File-based counts — parallel fetch, no DB required (async-parallel rule).
  const [postsResult, pagesResult, media] = await Promise.all([
    getRepository().listPosts({ includeDrafts: true, pageSize: 9999 }),
    getRepository().listPages({ pageSize: Number.MAX_SAFE_INTEGER }),
    listUploads(UPLOADS_DIR),
  ]);
  const pages = pagesResult.pages;

  const now = new Date().toISOString().slice(0, 10);
  const { published, draft, scheduled } = splitPostsByStatus(postsResult.posts, now);
  const { language: loc } = await getLayoutSiteConfig();

  // DB-backed counts — TWO INDEPENDENT try/catch blocks.
  // One failing must NOT affect the other tile (spec: DB-Backed Tile Degradation).
  let pendingCount: number | null;
  try {
    pendingCount = (await getCommentRepository().listPending()).length;
  } catch {
    pendingCount = null;
  }

  let userCount: number | null;
  try {
    userCount = (await getUserRepository().listUsers()).length;
  } catch {
    userCount = null;
  }

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.dashboard.title")} />

      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mt-8 mb-4">{t(loc, "admin.dashboard.atAGlance")}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatTile label={t(loc, "admin.dashboard.publishedPosts")} value={published} tone="emerald" />
        <StatTile label={t(loc, "admin.dashboard.draftPosts")} value={draft} tone="amber" />
        <StatTile label={t(loc, "admin.dashboard.scheduledPosts")} value={scheduled} tone="sky" />
        <StatTile label={t(loc, "admin.dashboard.pages")} value={pages.length} tone="violet" />
        <StatTile label={t(loc, "admin.dashboard.mediaFiles")} value={media.length} tone="cyan" />
        <StatTile label={t(loc, "admin.dashboard.pendingComments")} value={pendingCount ?? "—"} tone="rose" />
        <StatTile label={t(loc, "admin.dashboard.users")} value={userCount ?? "—"} tone="blue" />
      </div>

      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mt-8 mb-4">{t(loc, "admin.dashboard.quickActions")}</h2>
      <nav className="flex flex-wrap gap-2">
        {/* One primary action (accent); the rest are neutral shortcuts so the
            blue keeps signalling "the main thing to do". */}
        <ButtonLink href="/admin/posts/new" variant="accent" size="sm">{t(loc, "admin.dashboard.newPost")}</ButtonLink>
        <ButtonLink href="/admin/pages/new" variant="secondary" size="sm">{t(loc, "admin.dashboard.newPage")}</ButtonLink>
        <ButtonLink href="/admin/comments" variant="secondary" size="sm">{t(loc, "admin.dashboard.moderateComments")}</ButtonLink>
        <ButtonLink href="/admin/media" variant="secondary" size="sm">{t(loc, "admin.dashboard.uploadMedia")}</ButtonLink>
        <ButtonLink href="/admin/menus" variant="secondary" size="sm">{t(loc, "admin.dashboard.menus")}</ButtonLink>
        <ButtonLink href="/admin/settings" variant="secondary" size="sm">{t(loc, "admin.dashboard.settings")}</ButtonLink>
      </nav>

      {/* RBAC-gated widgets — each in its own Suspense boundary so they stream and fail independently */}
      {(canModerate || canCreate) && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Suspense fallback={<WidgetSkeleton title={t(loc, "admin.recentComments.title")} />}>
            {canModerate && <RecentCommentsWidget />}
          </Suspense>
          <Suspense fallback={<WidgetSkeleton title={t(loc, "admin.quickDraft.title")} />}>
            {canCreate && <QuickDraftForm action={createQuickDraftAction} />}
          </Suspense>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AdminContent />
    </Suspense>
  );
}
