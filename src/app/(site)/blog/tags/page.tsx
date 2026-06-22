import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getLayoutSiteConfig();
  return {
    title: t(config.language, "common.tags"),
    description: t(config.language, "common.browseByTagDesc"),
  };
}

async function TagsContent() {
  await connection();
  const repo = getRepository();
  const [tags, config] = await Promise.all([
    repo.listTags(),
    repo.getSiteConfig(),
  ]);
  const loc = config.language ?? "en";

  if (tags.length === 0) {
    return <p className="text-zinc-500 dark:text-zinc-400">{t(loc, "common.noTags")}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-3" aria-label={t(loc, "common.allTags")}>
      {tags.map((tag) => (
        <li key={tag.slug}>
          <Link
            href={`/blog/tags/${tag.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            {tag.label}
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              ({tag.count})
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function TagsIndexPage() {
  const config = await getLayoutSiteConfig();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-8">
        {t(config.language, "common.tags")}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <TagsContent />
      </Suspense>
    </div>
  );
}
