import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  getRepository,
  parseYearParam,
  parseMonthParam,
  filterPostsByYearMonth,
  buildArchiveIndex,
  formatPeriodLabel,
  hideFuturePosts,
  getLayoutSiteConfig,
} from "@/lib/content";
import { t } from "@/lib/i18n";
import { PostCard } from "@/app/components/post-card";
import { buildPageGraph, type BreadcrumbItem } from "@/lib/jsonld";

export async function generateStaticParams() {
  const { posts } = await getRepository().listPosts({ pageSize: 9999 });
  const periods = buildArchiveIndex(posts);

  if (periods.length === 0) {
    return [{ year: "__placeholder__", month: "__placeholder__" }];
  }

  return periods.map((p) => ({
    year: String(p.year),
    month: String(p.month).padStart(2, "0"),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}): Promise<Metadata> {
  const { year, month } = await params;
  const y = parseYearParam(year);
  const m = parseMonthParam(month);
  const config = await getLayoutSiteConfig();
  const lang = config.language ?? "en";
  if (y === null || m === null) {
    return { title: t(lang, "common.archives") };
  }
  return {
    title: t(lang, "common.archivesFor", { period: formatPeriodLabel(y, m) }),
    alternates: { canonical: `/blog/archive/${year}/${month}` },
  };
}

async function MonthContent({ year, month }: { year: number; month: number }) {
  await connection();
  const repo = getRepository();
  const [{ posts: rawPosts }, config] = await Promise.all([
    repo.listPosts({ pageSize: 9999 }),
    repo.getSiteConfig(),
  ]);
  const now = new Date().toISOString().slice(0, 10);
  const filtered = filterPostsByYearMonth(hideFuturePosts(rawPosts, now), year, month);

  if (filtered.length === 0) {
    notFound();
  }

  const loc = config.language ?? "en";
  return (
    <>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        {t(loc, filtered.length === 1 ? "common.postsCountOne" : "common.postsCount", { count: filtered.length })}
      </p>
      <ul
        className="space-y-10"
        aria-label={t(loc, "common.postsFromYear", { year })}
      >
        {filtered.map((post) => (
          <li key={post.slug}>
            <PostCard post={post} timezone={config.timezone} dateFormat={config.dateFormat} locale={config.language} structure={config.permalinks?.structure ?? "plain"} />
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function MonthArchivePage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
  const { year, month } = await params;
  const y = parseYearParam(year);
  const m = parseMonthParam(month);

  if (y === null || m === null) {
    notFound();
  }

  const config = await getLayoutSiteConfig();
  const base = config.baseUrl.replace(/\/$/, "");
  const url = `${base}/blog/archive/${year}/${month}`;
  const crumbs: BreadcrumbItem[] = [
    { name: "Home", url: base },
    { name: t(config.language, "common.blog"), url: `${base}/blog` },
    { name: t(config.language, "common.archives"), url: `${base}/blog/archive` },
    { name: formatPeriodLabel(y), url: `${base}/blog/archive/${year}` },
    { name: formatPeriodLabel(y, m), url },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildPageGraph({
              base,
              url,
              name: t(config.language, "common.archivesFor", { period: formatPeriodLabel(y, m) }),
              language: config.language,
              pageType: "CollectionPage",
              breadcrumbItems: crumbs,
            })
          ),
        }}
      />
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        {t(config.language, "common.archivesFor", { period: formatPeriodLabel(y, m) })}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <MonthContent year={y} month={m} />
      </Suspense>
    </div>
  );
}
