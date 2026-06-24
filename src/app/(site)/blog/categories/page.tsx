import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { renderTermDescription } from "@/lib/content/render-term-description";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getLayoutSiteConfig();
  return {
    title: t(config.language, "common.categories"),
    description: t(config.language, "common.browseByCategory"),
    alternates: { canonical: "/blog/categories" },
  };
}

async function CategoriesContent() {
  await connection();
  const repo = getRepository();
  const [categories, config] = await Promise.all([
    repo.listCategories(),
    repo.getSiteConfig(),
  ]);
  const loc = config.language ?? "en";

  if (categories.length === 0) {
    return <p className="text-zinc-500 dark:text-zinc-400">{t(loc, "common.noCategories")}</p>;
  }

  const descriptionHtmls = await Promise.all(
    categories.map((cat) => renderTermDescription(cat.description))
  );

  return (
    <ul className="space-y-1" aria-label={t(loc, "common.allCategories")}>
      {categories.map((cat, i) => (
        <li
          key={cat.slug}
          style={{ paddingLeft: `${(cat.depth - 1) * 16}px` }}
        >
          <Link
            href={`/blog/categories/${cat.segments.join("/")}`}
            className="inline-flex items-center gap-1.5 py-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            {cat.label}
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              ({cat.count})
            </span>
          </Link>
          {descriptionHtmls[i] && (
            <div
              className="prose prose-zinc dark:prose-invert max-w-none
                prose-headings:font-semibold prose-headings:tracking-tight
                prose-a:[color:var(--color-primary,#18181b)] dark:prose-a:[color:var(--color-primary,#fafafa)]
                prose-a:[text-decoration-color:var(--color-accent,currentColor)] prose-a:underline prose-a:underline-offset-4
                prose-code:rounded prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:text-sm
                prose-pre:bg-zinc-950 dark:prose-pre:bg-zinc-900 prose-pre:rounded-lg
                prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-700
                prose-img:rounded-lg text-sm"
              dangerouslySetInnerHTML={{ __html: descriptionHtmls[i]! }}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function CategoriesIndexPage() {
  const config = await getLayoutSiteConfig();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-8">
        {t(config.language, "common.categories")}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <CategoriesContent />
      </Suspense>
    </div>
  );
}
