// Category merge page — server component shell with client island.
// NO 'use cache' — verifySession() reads cookies (forces dynamic rendering, D11).
// Suspense + inner async pattern.

import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { buildCategoryIndex } from "@/lib/content/category";
import { MergeCategoryForm } from "./merge-category-form";

interface MergeContentProps {
  params: Promise<{ slug: string }>;
}

async function MergeContent({ params }: MergeContentProps) {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const { slug } = await params;

  const { posts } = await getRepository().listPosts({
    includeDrafts: true,
    pageSize: 9999,
  });

  const categories = buildCategoryIndex(posts.map((p) => p.categories));
  const entry = categories.find((c) => c.slug === slug);

  if (!entry) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.taxonomy.notFoundCategory")}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.taxonomy.notFoundSlug", { type: "category", slug })}</p>
        <a href="/admin/categories" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.taxonomy.backToCategories")}</a>
      </div>
    );
  }

  // All categories except the source (to avoid merging into self)
  const otherCategories = categories
    .filter((c) => c.slug !== slug)
    .map((c) => ({ label: c.label, slug: c.slug }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.taxonomy.mergeCategoryTitle")}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t(loc, "admin.taxonomy.mergeIntoDesc", { source: entry.label })}
      </p>
      <div className="mt-4">
        <MergeCategoryForm
          rawLabel={entry.label}
          otherCategories={otherCategories}
        />
      </div>
      <p className="mt-4">
        <a href="/admin/categories" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.common.cancel")}</a>
      </p>
    </div>
  );
}

export default function MergeCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <MergeContent params={params} />
    </Suspense>
  );
}
