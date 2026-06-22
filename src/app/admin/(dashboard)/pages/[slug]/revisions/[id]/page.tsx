// Page revision detail page — server component.
// verifySession() is called FIRST inside the inner async component.
// Shows colored diff (revision vs current) and a Restore form.
// Gracefully degrades when DB is unavailable (catch block → shows "unavailable" message).
// DB-down (caught) is distinct from genuinely-missing id (notFound()).
// NO 'export const dynamic' — verifySession() makes this dynamic automatically.

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { getRevisionRepository } from "@/lib/revisions/factory";
import { getPageWriter } from "@/lib/content";
import {
  buildPageFileContent,
  type PageSerializableFrontmatter,
} from "@/lib/content/fs-page-writer";
import { computeLineDiff } from "@/lib/revisions/diff";
import { RevisionDiff } from "@/app/admin/(dashboard)/_components/revision-diff";
import { restoreRevisionAction } from "../actions";

interface RevisionDetailContentProps {
  params: Promise<{ slug: string; id: string }>;
}

async function RevisionDetailContent({ params }: RevisionDetailContentProps) {
  const session = await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const { slug, id } = await params;

  // Capability gate: pages have no author ownership; authors cannot access page revisions
  if (!can(session.role, "pages:edit")) {
    redirect("/admin");
  }

  let rev;
  try {
    rev = await getRevisionRepository().getById(id);
  } catch {
    // DB unavailable — graceful degradation
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t(loc, "admin.revisions.revision")}</h1>
          <Link
            href={`/admin/pages/${slug}/revisions`}
            className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
          >
            {t(loc, "admin.revisions.backToRevisions")}
          </Link>
        </div>
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-4 py-6 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t(loc, "admin.revisions.revisionUnavailable")}
          </p>
        </div>
      </div>
    );
  }

  if (!rev) {
    notFound();
  }

  const dateStr = rev.createdAt.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Reconstruct current page file string for diff — best-effort, never crashes the page.
  // readRawPage returns parsed parts; we re-serialize with buildPageFileContent
  // to get an apples-to-apples string matching the capture-time format (ADR-1).
  let currentRaw: string | null = null;
  try {
    const raw = await getPageWriter().readRawPage(slug);
    if (raw) {
      currentRaw = buildPageFileContent(
        raw.rawData as PageSerializableFrontmatter,
        raw.body
      );
    }
  } catch {
    currentRaw = null;
  }

  const diff =
    currentRaw !== null ? computeLineDiff(currentRaw, rev.rawContent) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t(loc, "admin.revisions.revisionNumber", { seq: rev.sequence })}
        </h1>
        <Link
          href={`/admin/pages/${slug}/revisions`}
          className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
        >
          {t(loc, "admin.revisions.backToRevisions")}
        </Link>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium text-zinc-500 dark:text-zinc-400 w-24">{t(loc, "admin.revisions.saved")}</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{dateStr}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-zinc-500 dark:text-zinc-400 w-24">{t(loc, "admin.revisions.source")}</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{rev.source}</dd>
        </div>
        {rev.authorLabel && (
          <div className="flex gap-2">
            <dt className="font-medium text-zinc-500 dark:text-zinc-400 w-24">{t(loc, "admin.revisions.author")}</dt>
            <dd className="text-zinc-900 dark:text-zinc-50">{rev.authorLabel}</dd>
          </div>
        )}
        {rev.slug !== slug && (
          <div className="flex gap-2">
            <dt className="font-medium text-zinc-500 dark:text-zinc-400 w-24">{t(loc, "admin.revisions.historicSlug")}</dt>
            <dd>
              <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">
                {rev.slug}
              </code>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                {t(loc, "admin.revisions.informationalOnly")}
              </span>
            </dd>
          </div>
        )}
      </dl>

      <div>
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
          {t(loc, "admin.revisions.changesIfRestore")}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
          {t(loc, "admin.revisions.diffGreenRed")}
        </p>
        {diff !== null ? (
          <RevisionDiff lines={diff} />
        ) : (
          <>
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 mb-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {t(loc, "admin.revisions.currentNotFound")}
              </p>
            </div>
            <pre className="overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 text-xs text-zinc-800 dark:text-zinc-200 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {rev.rawContent}
            </pre>
          </>
        )}
      </div>

      <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          <strong>{t(loc, "admin.revisions.noteLabel")}</strong> {t(loc, "admin.revisions.restoreNote", { slug })}
        </p>
      </div>

      <form action={restoreRevisionAction.bind(null, slug, id)}>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 transition-colors"
        >
          {t(loc, "admin.revisions.restoreThisRevision")}
        </button>
      </form>
    </div>
  );
}

export default function PageRevisionDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <RevisionDetailContent params={params} />
    </Suspense>
  );
}
