import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getRepository, hideFuturePosts, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { PostCard } from "@/app/components/post-card";

export async function generateStaticParams() {
  const repo = getRepository();
  const tags = await repo.listTags();

  if (tags.length === 0) {
    return [{ tag: "__placeholder__" }];
  }

  return tags.map((t) => ({ tag: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const config = await getLayoutSiteConfig();
  const lang = config.language ?? "en";
  return {
    title: t(lang, "common.postsTagged", { tag }),
    description: t(lang, "common.allPostsTagged", { tag }),
  };
}

async function TagContent({ tag }: { tag: string }) {
  await connection();
  const repo = getRepository();
  const [{ posts: rawPosts }, config] = await Promise.all([
    repo.listPosts({ tag }),
    repo.getSiteConfig(),
  ]);
  const now = new Date().toISOString().slice(0, 10);
  const posts = hideFuturePosts(rawPosts, now);

  if (posts.length === 0) {
    notFound();
  }

  const loc = config.language ?? "en";
  return (
    <>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        {t(loc, posts.length === 1 ? "common.postsCountOne" : "common.postsCount", { count: posts.length })}
      </p>
      <ul className="space-y-10" aria-label={t(loc, "common.postsTaggedAria", { tag })}>
        {posts.map((post) => (
          <li key={post.slug}>
            <PostCard post={post} timezone={config.timezone} dateFormat={config.dateFormat} locale={config.language} structure={config.permalinks?.structure ?? "plain"} />
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;

  const config = await getLayoutSiteConfig();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        {t(config.language, "common.postsTagged", { tag })}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <TagContent tag={tag} />
      </Suspense>
    </div>
  );
}
