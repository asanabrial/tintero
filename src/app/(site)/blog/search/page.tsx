import { Suspense } from "react";
import type { Metadata } from "next";
import { getRepository, hideFuturePosts, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { PostCard } from "@/app/components/post-card";
import { SearchForm } from "@/app/components/search-form";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getLayoutSiteConfig();
  return {
    title: t(config.language, "common.search"),
    robots: { index: false, follow: true },
  };
}

// Async shell — only awaits getLayoutSiteConfig() which is 'use cache'-keyed
// on a stable constant, so PPR is preserved (REQ-RT-02).
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const config = await getLayoutSiteConfig();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-8">
        {t(config.language, "common.search")}
      </h1>
      <div className="mb-8">
        {/* No defaultValue — shell stays static (ADR-4) */}
        <SearchForm locale={config.language} />
      </div>
      <Suspense
        fallback={
          <p className="text-zinc-500 dark:text-zinc-400">{t(config.language, "common.searching")}</p>
        }
      >
        {/* SearchResults is the ONLY place searchParams is awaited.
            Suspense satisfies the cacheComponents rule: runtime data access
            must be inside a Suspense boundary (REQ-RT-03, REQ-RT-05). */}
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Async child — awaits searchParams inside Suspense (REQ-RT-03)
// ---------------------------------------------------------------------------

async function SearchResults({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.s) ? sp.s[0] : sp.s; // tolerate ?s=a&s=b
  const s = (raw ?? "").trim();

  // Empty / whitespace-only query → prompt state (REQ-UI-01)
  if (s === "") {
    const repo = getRepository();
    const config = await repo.getSiteConfig();
    return (
      <p className="text-zinc-500 dark:text-zinc-400">
        {t(config.language, "common.searchPrompt")}
      </p>
    );
  }

  // Route passes pageSize: 9999 so all matched posts are returned in v1.
  // The adapter comment at the pagination slice documents this contract.
  const repo = getRepository();
  const [{ posts: rawPosts }, config] = await Promise.all([
    repo.listPosts({ query: s, pageSize: 9999 }),
    repo.getSiteConfig(),
  ]);
  const loc = config.language ?? "en";
  const now = new Date().toISOString().slice(0, 10);
  const posts = hideFuturePosts(rawPosts, now);

  // No results → no-results state (REQ-UI-02)
  if (posts.length === 0) {
    return (
      <>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          {t(loc, "common.searchResultsFor", { query: s })}
        </p>
        <p className="text-zinc-500 dark:text-zinc-400">
          {t(loc, "common.noPostsFound", { query: s })}
        </p>
      </>
    );
  }

  // Results state (REQ-UI-03, REQ-UI-04)
  return (
    <>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
        {t(loc, "common.searchResultsFor", { query: s })}
      </p>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        {t(loc, posts.length === 1 ? "common.postsCountOne" : "common.postsCount", { count: posts.length })}
      </p>
      <ul className="space-y-10" aria-label={t(loc, "common.searchResultsFor", { query: s })}>
        {posts.map((post) => (
          <li key={post.slug}>
            <PostCard post={post} timezone={config.timezone} dateFormat={config.dateFormat} locale={config.language} structure={config.permalinks?.structure ?? "plain"} />
          </li>
        ))}
      </ul>
    </>
  );
}
