import type { Metadata } from "next";
import { Suspense, use } from "react";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { connection } from "next/server";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { matchRedirect } from "@/lib/seo/redirects";
import { loadRedirects } from "@/lib/seo/redirect-store";
import { Prose } from "@/app/components/prose";
import { LinkPreview, type PreviewMap } from "@/app/components/link-preview";
import { Backlinks } from "@/app/components/backlinks";
import { UnlinkedMentions } from "@/app/components/unlinked-mentions";
import { LocalGraph } from "@/app/components/local-graph";
import {
  publicGraph,
  backlinks as backlinksFor,
  localGraph,
  toGraphView,
  nodeId,
} from "@/lib/content/links";

export async function generateStaticParams() {
  const repo = getRepository();
  const { pages } = await repo.listPages({ pageSize: Number.MAX_SAFE_INTEGER });

  if (pages.length === 0) {
    return [{ slug: "__placeholder__" }];
  }

  return pages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const repo = getRepository();
  const page = await repo.getPage(slug);

  if (!page) {
    const { language: loc } = await getLayoutSiteConfig();
    return { title: t(loc, "common.pageNotFound") };
  }

  // Yoast-style SEO overrides win over the page title/excerpt.
  const seoTitle = page.seo?.title?.trim() || page.title;
  const seoDescription = page.seo?.metaDescription?.trim() || page.excerpt;
  const canonical = page.seo?.canonical?.trim() || `/pages/${slug}`;
  const ogImage = page.seo?.ogImage?.trim();

  return {
    title: seoTitle,
    description: seoDescription,
    ...(page.seo?.noindex ? { robots: { index: false, follow: false } } : {}),
    alternates: { canonical },
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      type: "website",
      url: `/pages/${slug}`,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: seoTitle,
      description: seoDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

async function PageContent({ slug }: { slug: string }) {
  await connection();
  const repo = getRepository();
  const id = nodeId("page", slug);
  const [page, { posts: allPosts }, { pages: allPages }, linkGraph, mentions, { language: loc }] =
    await Promise.all([
      repo.getPage(slug),
      repo.listPosts({ pageSize: 9999 }),
      repo.listPages({ pageSize: 9999 }),
      repo.getLinkGraph(),
      repo.getUnlinkedMentions(id, { publicOnly: true }),
      getLayoutSiteConfig(),
    ]);

  if (!page) {
    // Yoast-style redirect for a removed/renamed page URL (applied only on miss).
    const rule = matchRedirect(`/pages/${slug}`, await loadRedirects());
    if (rule) {
      if (rule.permanent) permanentRedirect(rule.to);
      redirect(rule.to);
    }
    notFound();
  }

  // Resolve parent breadcrumb when parent is set
  let parentPage: Awaited<ReturnType<typeof repo.getPage>> | null = null;
  if (page.parent) {
    parentPage = await repo.getPage(page.parent);
    // If parent is a draft or missing, omit the breadcrumb
    if (parentPage?.status === "draft") {
      parentPage = null;
    }
  }

  // Obsidian-style relationship surfaces, derived from the PUBLIC subgraph.
  const reader = publicGraph(linkGraph);
  const back = backlinksFor(id, reader);
  const localView = toGraphView(localGraph(id, reader, 1));

  // Hover-preview map built from the public listings (no gated content leaks).
  const previews: PreviewMap = {};
  for (const p of allPosts) {
    previews[`/blog/${p.slug}`] = { title: p.title, excerpt: p.excerpt };
  }
  for (const pg of allPages) {
    previews[`/pages/${pg.slug}`] = { title: pg.title, excerpt: pg.excerpt };
  }

  return (
    <>
      {parentPage && (
        <nav className="mb-4 text-sm text-zinc-500 dark:text-zinc-400" aria-label={t(loc, "common.breadcrumb")}>
          <span>{parentPage.title}</span>
          <span className="mx-1">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">{page.title}</span>
        </nav>
      )}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {page.title}
        </h1>
      </header>
      <LinkPreview previews={previews}>
        <Prose html={page.html} />
      </LinkPreview>
      <Backlinks nodes={back} locale={loc} />
      <UnlinkedMentions mentions={mentions} locale={loc} />
      <LocalGraph view={localView} focusId={id} locale={loc} />
    </>
  );
}

export default function StaticPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <PageContent slug={slug} />
      </Suspense>
    </article>
  );
}
