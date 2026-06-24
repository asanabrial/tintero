import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getRepository, buildAuthorIndex, filterPostsByAuthor, hideFuturePosts, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { PostCard } from "@/app/components/post-card";
import { buildPageGraph, type BreadcrumbItem } from "@/lib/jsonld";
import { gravatarUrl } from "@/lib/avatar/gravatar";
import { Avatar } from "@/app/components/avatar";

export async function generateStaticParams() {
  const { posts } = await getRepository().listPosts({ pageSize: 9999 });
  const entries = buildAuthorIndex(posts);

  if (entries.length === 0) {
    return [{ author: "__placeholder__" }];
  }

  return entries.map((e) => ({ author: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ author: string }>;
}): Promise<Metadata> {
  const { author } = await params;
  const { posts } = await getRepository().listPosts({ pageSize: 9999 });
  const entries = buildAuthorIndex(posts);
  const entry = entries.find((e) => e.slug === author);
  const config = await getLayoutSiteConfig();
  const lang = config.language ?? "en";
  return {
    title: entry
      ? t(lang, "common.postsBy", { name: entry.name })
      : t(lang, "common.authors"),
    alternates: { canonical: `/blog/author/${author}` },
  };
}

async function AuthorContent({ author }: { author: string }) {
  await connection();
  const repo = getRepository();
  const [{ posts: rawPosts }, config] = await Promise.all([
    repo.listPosts({ pageSize: 9999 }),
    repo.getSiteConfig(),
  ]);
  const now = new Date().toISOString().slice(0, 10);
  const visible = hideFuturePosts(rawPosts, now);
  const filtered = filterPostsByAuthor(visible, author);

  if (filtered.length === 0) {
    notFound();
  }

  const entries = buildAuthorIndex(visible);
  const displayName = entries.find((e) => e.slug === author)?.name ?? author;

  let authorBio: string | null = null;
  let authorAvatarUrl: string | null = null;
  try {
    const { getUserRepository } = await import("@/lib/auth/factory");
    const userRepo = getUserRepository();
    const userRecord = await userRepo.findPublicByName(displayName);
    if (userRecord?.bio) authorBio = userRecord.bio;
    if (userRecord?.email) authorAvatarUrl = gravatarUrl(userRecord.email, { size: 80 });
  } catch {
    // DB outage or no DB — render no bio or avatar
  }

  const loc = config.language ?? "en";
  return (
    <>
      {authorAvatarUrl && (
        <div className="mb-4">
          <Avatar src={authorAvatarUrl} name={displayName} size={80} />
        </div>
      )}
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        {t(loc, filtered.length === 1 ? "common.postsCountOne" : "common.postsCount", { count: filtered.length })}
      </p>
      {authorBio && (
        <p className="text-zinc-700 dark:text-zinc-300 mb-6">{authorBio}</p>
      )}
      <ul className="space-y-10" aria-label={t(loc, "common.postsBy", { name: displayName })}>
        {filtered.map((post) => (
          <li key={post.slug}>
            <PostCard post={post} timezone={config.timezone} dateFormat={config.dateFormat} locale={config.language} structure={config.permalinks?.structure ?? "plain"} />
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function AuthorListingPage({
  params,
}: {
  params: Promise<{ author: string }>;
}) {
  const { author } = await params;

  // Derive a readable display name from the slug for the static shell heading.
  // AuthorContent resolves the real display name from the data at request time.
  const displayName = author.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const config = await getLayoutSiteConfig();
  const base = config.baseUrl.replace(/\/$/, "");
  const url = `${base}/blog/author/${author}`;
  const crumbs: BreadcrumbItem[] = [
    { name: "Home", url: base },
    { name: t(config.language, "common.blog"), url: `${base}/blog` },
    { name: t(config.language, "common.authors"), url: `${base}/blog/author` },
    { name: displayName, url },
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
              name: t(config.language, "common.postsBy", { name: displayName }),
              language: config.language,
              pageType: "CollectionPage",
              breadcrumbItems: crumbs,
            })
          ),
        }}
      />
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        {t(config.language, "common.postsBy", { name: displayName })}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <AuthorContent author={author} />
      </Suspense>
    </div>
  );
}
