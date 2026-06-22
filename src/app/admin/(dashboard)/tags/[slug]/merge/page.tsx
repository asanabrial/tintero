// Tag merge page — server component shell with client island.
// NO 'use cache' — verifySession() reads cookies (forces dynamic rendering, D11).
// Suspense + inner async pattern.

import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { buildTagIndex } from "@/lib/content/tag";
import { MergeTagForm } from "./merge-tag-form";

interface MergeTagContentProps {
  params: Promise<{ slug: string }>;
}

async function MergeTagContent({ params }: MergeTagContentProps) {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const { slug } = await params;

  const { posts } = await getRepository().listPosts({
    includeDrafts: true,
    pageSize: 9999,
  });

  const tags = buildTagIndex(posts.map((p) => p.tags));
  const entry = tags.find((t) => t.slug === slug);

  if (!entry) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.taxonomy.notFoundTag")}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.taxonomy.notFoundSlug", { type: "tag", slug })}</p>
        <a href="/admin/tags" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.taxonomy.backToTags")}</a>
      </div>
    );
  }

  // All tags except the source (to avoid merging into self)
  const otherTags = tags
    .filter((t) => t.slug !== slug)
    .map((t) => ({ label: t.label, slug: t.slug }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.taxonomy.mergeTagTitle")}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t(loc, "admin.taxonomy.mergeIntoTagDesc", { source: entry.label })}
      </p>
      <div className="mt-4">
        <MergeTagForm rawLabel={entry.label} otherTags={otherTags} />
      </div>
      <p className="mt-4">
        <a href="/admin/tags" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.common.cancel")}</a>
      </p>
    </div>
  );
}

export default function MergeTagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <MergeTagContent params={params} />
    </Suspense>
  );
}
