// Tag delete confirmation page — server component.
// NO 'use cache' — verifySession() reads cookies (forces dynamic rendering, D11).
// Plain server form action — mirrors categories/[slug]/delete pattern.
// Empty tags after delete → [] (D5), no Uncategorized note.

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { findAffectedPosts } from "@/lib/content/taxonomy-ops";
import { deleteTagAction } from "../../actions";

interface DeleteTagContentProps {
  params: Promise<{ slug: string }>;
}

async function DeleteTagContent({ params }: DeleteTagContentProps) {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const { slug } = await params;

  const [{ posts }, tags] = await Promise.all([
    getRepository().listPosts({ includeDrafts: true, pageSize: 9999 }),
    getRepository().listTags(),
  ]);

  const entry = tags.find((t) => t.slug === slug);

  if (!entry) {
    notFound();
  }

  const affectedCount = findAffectedPosts(posts, "tags", entry.label).length;

  const boundAction = deleteTagAction.bind(null, entry.label);

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.taxonomy.deleteTagTitle")}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t(loc, "admin.taxonomy.aboutToDeleteTag", { label: entry.label })}
      </p>
      <dl className="space-y-2 mt-4">
        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.taxonomy.affectedPosts")}</dt>
        <dd className="text-sm text-zinc-900 dark:text-zinc-50">{affectedCount}</dd>
      </dl>
      <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 mt-4">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {t(loc, "admin.taxonomy.deleteWarningTag")}
        </p>
      </div>
      <form action={boundAction} className="mt-4">
        <button type="submit" className="rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{t(loc, "admin.taxonomy.confirmDeleteTag")}</button>
      </form>
      <p className="mt-4">
        <a href="/admin/tags" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.common.cancel")}</a>
      </p>
    </div>
  );
}

export default function DeleteTagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <DeleteTagContent params={params} />
    </Suspense>
  );
}
