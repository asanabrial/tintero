// Revisions list page for a page — server component.
// verifySession() is called FIRST inside the inner async component.
// Gracefully degrades when DB is unavailable (catch block → shows "unavailable" message).
// NO 'export const dynamic' — verifySession() makes this dynamic automatically.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getLayoutSiteConfig } from "@/lib/content";
import { getRevisionRepository } from "@/lib/revisions/factory";
import { t } from "@/lib/i18n";
import type { Revision } from "@/lib/revisions/types";

// ============================================================
// Source badge helpers
// ============================================================

const SOURCE_BADGE_STYLES: Record<string, string> = {
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  api: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cli: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  wizard: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
};

function SourceBadge({ source }: { source: string }) {
  const style =
    SOURCE_BADGE_STYLES[source] ??
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {source}
    </span>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================
// Inner server component
// ============================================================

interface RevisionsContentProps {
  params: Promise<{ slug: string }>;
}

async function RevisionsContent({ params }: RevisionsContentProps) {
  const session = await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const { slug } = await params;

  // Capability gate: pages have no author ownership; authors cannot access page revisions
  if (!can(session.role, "pages:edit")) {
    redirect("/admin");
  }

  let revisions: Revision[] | null = null;
  try {
    revisions = await getRevisionRepository().listForSlug("page", slug);
  } catch {
    // DB unavailable — graceful degradation
    revisions = null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t(loc, "admin.revisions.title")}
        </h1>
        <a
          href={`/admin/pages/${slug}/edit`}
          className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
        >
          {t(loc, "admin.revisions.backToEdit")}
        </a>
      </div>

      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        {t(loc, "admin.revisions.pageLabel")}{" "}
        <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">
          {slug}
        </code>
      </p>

      {revisions === null ? (
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-4 py-6 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t(loc, "admin.revisions.unavailable")}
          </p>
        </div>
      ) : revisions.length === 0 ? (
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-4 py-6 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t(loc, "admin.revisions.empty")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {revisions.map((rev) => (
            <li
              key={rev.id}
              className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                    #{rev.sequence}
                  </span>
                  <SourceBadge source={rev.source} />
                  {rev.authorLabel && (
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {rev.authorLabel}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(rev.createdAt)}
                  </span>
                </div>
                <a
                  href={`/admin/pages/${slug}/revisions/${rev.id}`}
                  className="shrink-0 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
                >
                  {t(loc, "admin.revisions.view")}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PageRevisionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading revisions…</p>}>
      <RevisionsContent params={params} />
    </Suspense>
  );
}
