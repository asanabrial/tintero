// Delete confirmation page — server component.
// verifySession() is called FIRST per the auth pattern.
// NO 'use cache' directive — calls verifySession() which reads cookies.

import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getPageWriter, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { deletePageAction } from "../../actions";

interface DeletePageContentProps {
  params: Promise<{ slug: string }>;
}

async function DeletePageContent({ params }: DeletePageContentProps) {
  const session = await verifySession();
  if (!can(session.role, "pages:delete")) redirect("/admin");
  const { language: loc } = await getLayoutSiteConfig();

  const { slug } = await params;
  const raw = await getPageWriter().readRawPage(slug);

  if (!raw) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
          {t(loc, "admin.pages.notFound")}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t(loc, "admin.pages.notFoundDesc", { slug })}
        </p>
        <Link href="/admin/pages" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">
          {t(loc, "admin.trash.backToPages")}
        </Link>
      </div>
    );
  }

  const title =
    typeof raw.frontmatter.title === "string" ? raw.frontmatter.title : slug;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
        {t(loc, "admin.delete.heading")}
      </h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t(loc, "admin.delete.confirmPage")}
      </p>
      <dl className="space-y-2">
        <div>
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            {t(loc, "admin.delete.colTitle")}
          </dt>
          <dd className="text-sm text-zinc-900 dark:text-zinc-50">{title}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            {t(loc, "admin.delete.colSlug")}
          </dt>
          <dd className="text-sm text-zinc-900 dark:text-zinc-50">
            <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">{slug}</code>
          </dd>
        </div>
      </dl>
      <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
        <p className="text-sm text-red-700 dark:text-red-400">
          <strong>{t(loc, "admin.delete.warningLabel")}</strong>{" "}
          {t(loc, "admin.delete.warningPage")}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <form action={deletePageAction.bind(null, slug)}>
          <button
            type="submit"
            className="rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t(loc, "admin.delete.moveToTrash")}
          </button>
        </form>
        <Link
          href="/admin/pages"
          className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
        >
          {t(loc, "admin.common.cancel")}
        </Link>
      </div>
    </div>
  );
}

export default function DeletePagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <DeletePageContent params={params} />
    </Suspense>
  );
}
