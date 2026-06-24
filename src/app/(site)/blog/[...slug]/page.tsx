import type { Metadata } from "next";
import { use, Suspense } from "react";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { connection } from "next/server";
import { matchRedirect } from "@/lib/seo/redirects";
import { loadRedirects } from "@/lib/seo/redirect-store";
import Link from "next/link";
import { getRepository, relatedPosts, prevNextPosts, hideFuturePosts, isFuturePost, slugifyAuthor, getLayoutSiteConfig } from "@/lib/content";
import { postPath, permalinkSlug } from "@/lib/content/permalink";
import { postsFingerprint } from "@/lib/content/fingerprint";
import type { Post } from "@/lib/content";
import { buildPostGraph, buildPostBreadcrumbItems } from "@/lib/jsonld";
import { buildPostSocialMetadata } from "@/lib/seo/social-meta";
import { t } from "@/lib/i18n";
import { Prose } from "@/app/components/prose";
import { LinkPreview, type PreviewMap } from "@/app/components/link-preview";
import { CategoryChips } from "@/app/components/category-chips";
import { TagChips } from "@/app/components/tag-chips";
import { Avatar } from "@/app/components/avatar";
import { gravatarUrl } from "@/lib/avatar/gravatar";
import { CommentsSection } from "@/app/components/comments-section";
import { CommentsErrorBoundary } from "@/app/components/comments-error-boundary";
import { RelatedPosts } from "@/app/components/related-posts";
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
import { PostNav } from "@/app/components/post-nav";
import { getWidgets } from "@/lib/widgets/repository";
import { WidgetArea } from "@/app/components/widget-area";
import { formatSiteDate } from "@/lib/content/format-date";
import { hashPostPassword } from "@/lib/content/post-password";
import { PasswordUnlockForm } from "./password-unlock-form";

// generateStaticParams enumerates slugs at build time — never touches comments DB.
// Future-dated posts are excluded from the static shell (build-time now is allowed).
// Satisfies: REQ-PPR-02, REQ-PPR-09, S-21.
export async function generateStaticParams() {
  const repo = getRepository();
  const [first, config] = await Promise.all([
    repo.listPosts({ page: 1 }),
    repo.getSiteConfig(),
  ]);
  const structure = config.permalinks?.structure ?? "plain";
  const all = [...first.posts];

  for (let page = 2; page <= first.totalPages; page++) {
    const result = await repo.listPosts({ page });
    all.push(...result.posts);
  }

  // Exclude future-dated posts from the static shell (build-time new Date() allowed).
  const now = new Date().toISOString().slice(0, 10);
  const visible = hideFuturePosts(all, now);
  // Catch-all params: split the canonical permalink (minus the /blog prefix) into
  // path segments for the configured structure (e.g. "plain" → [slug],
  // "day-and-name" → [year, month, day, slug]).
  const allSlugs = visible.map((p) => ({
    slug: postPath(p, structure).replace(/^\/blog\//, "").split("/"),
  }));

  if (allSlugs.length === 0) {
    return [{ slug: ["__placeholder__"] }];
  }

  return allSlugs;
}

// generateMetadata reads content repo only — never touches comments DB.
// Satisfies: REQ-PPR-03, REQ-PPR-09.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug: segments } = await params;
  const slug = permalinkSlug(segments) ?? "";
  const repo = getRepository();
  const [post, siteConfigMeta] = await Promise.all([
    repo.getPost(slug),
    repo.getSiteConfig(),
  ]);
  const loc = siteConfigMeta.language;

  if (!post) {
    // Check if it is a private or password post
    const privatePost = await repo.getPost(slug, { includeDrafts: true });
    if (privatePost?.visibility === "private") {
      return { title: t(loc, "common.privatePost") };
    }
    if (privatePost?.visibility === "password") {
      return {
        title: privatePost.title,
        description: t(loc, "common.passwordProtectedMeta"),
      };
    }
    return { title: t(loc, "common.postNotFound") };
  }

  if (post.visibility === "password") {
    return {
      title: post.title,
      description: t(loc, "common.passwordProtectedMeta"),
      alternates: {
        types: {
          "application/rss+xml": `/comments/${slug}/feed.xml`,
        },
      },
    };
  }

  // Yoast-style SEO overrides: a per-post SEO title / meta description wins over
  // the post title / excerpt for search engines and social cards.
  const seoTitle = post.seo?.title?.trim() || post.title;
  const seoDescription = post.seo?.metaDescription?.trim() || post.excerpt;
  const canonical = post.seo?.canonical?.trim() || postPath(post, siteConfigMeta.permalinks?.structure ?? "plain");

  // Complete Open Graph / Twitter Card fragment (site name, locale, author,
  // section, tags, modified time, site/author Twitter handle) — Yoast parity.
  const social = buildPostSocialMetadata(
    post,
    siteConfigMeta,
    siteConfigMeta.permalinks?.structure ?? "plain"
  );

  return {
    title: seoTitle,
    description: seoDescription,
    // robots noindex when the author opts this post out of search.
    ...(post.seo?.noindex ? { robots: { index: false, follow: false } } : {}),
    alternates: {
      canonical,
      types: {
        "application/rss+xml": `/comments/${slug}/feed.xml`,
      },
    },
    ...social,
  };
}

/**
 * Cached async component for the post body.
 * Takes `fp` (posts area fingerprint) as an explicit prop — this makes fp part of
 * the 'use cache' key (per use-cache.md: "Props or function arguments" are cache keys).
 * When the fingerprint changes (any .md added/edited/deleted), the cache misses
 * and the post body is re-fetched and re-rendered on the next request.
 * Satisfies: REQ-PPR-04, CACHE-01, PPR-02.
 */
async function PostBody({ slug, fp }: { slug: string; fp: string }) {
  "use cache";
  void fp; // fp is an explicit prop solely to key the cache; not used in the body

  const repo = getRepository();
  const id = nodeId("post", slug);
  const [post, { posts: allPosts }, { pages: allPages }, siteConfig, linkGraph, mentions] =
    await Promise.all([
      repo.getPost(slug),
      repo.listPosts({ pageSize: 9999 }),
      repo.listPages({ pageSize: 9999 }),
      repo.getSiteConfig(),
      repo.getLinkGraph(),
      repo.getUnlinkedMentions(id, { publicOnly: true }),
    ]);

  if (!post) {
    notFound();
  }

  // Hover-preview map for internal links in the body (Obsidian-style). Built from
  // the PUBLIC listings only (drafts/private excluded upstream), so no gated
  // content can surface in a preview card.
  const previews: PreviewMap = {};
  const previewStructure = siteConfig.permalinks?.structure ?? "plain";
  for (const p of allPosts) {
    const meta = { title: p.title, excerpt: p.excerpt };
    // Key by the canonical permalink AND the plain /blog/{slug} that wikilinks
    // (nodeUrl) emit in the body, so hover previews resolve under any structure.
    previews[postPath(p, previewStructure)] = meta;
    previews[`/blog/${p.slug}`] = meta;
  }
  for (const pg of allPages) {
    previews[`/pages/${pg.slug}`] = { title: pg.title, excerpt: pg.excerpt };
  }

  // Obsidian-style relationship surfaces, all derived from the PUBLIC subgraph so
  // drafts/private/password content never leaks: backlinks ("Linked from") and the
  // local graph (this note + its immediate neighbors).
  const reader = publicGraph(linkGraph);
  const back = backlinksFor(id, reader);
  const localView = toGraphView(localGraph(id, reader, 1));

  const base = siteConfig.baseUrl.replace(/\/$/, "");

  // ADR-5: filter future posts from the candidate set at cache-fill time.
  // new Date() inside 'use cache' is the ONE documented exception (bounded by fp keying).
  // Minor staleness within a cache window is accepted.
  const now = new Date().toISOString().slice(0, 10); // cache-fill-time now
  const visiblePosts = hideFuturePosts(allPosts, now);

  const related = relatedPosts(post, visiblePosts);
  const { prev, next } = prevNextPosts(post.slug, visiblePosts);

  const formattedDate = formatSiteDate(post.date, {
    timezone: siteConfig.timezone,
    dateFormat: siteConfig.dateFormat,
    locale: siteConfig.language,
  });

  const breadcrumbItems = buildPostBreadcrumbItems(post, base, siteConfig.permalinks?.structure ?? "plain");

  // Gravatar for author byline — look up user by display name to get email for hashing.
  // PostBody is "use cache" so DB calls are acceptable here.
  let authorAvatarUrl: string | null = null;
  if (post.author) {
    try {
      const { getUserRepository } = await import("@/lib/auth/factory");
      const userRecord = await getUserRepository().findPublicByName(post.author);
      if (userRecord?.email) {
        authorAvatarUrl = gravatarUrl(userRecord.email, { size: 24 });
      }
    } catch {
      // DB unavailable — skip avatar
    }
  }

  return (
    <>
      {/* Connected schema graph (WebPage › BreadcrumbList › BlogPosting › Person),
          cross-referencing the site WebSite/Organization nodes by @id — Yoast parity. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildPostGraph(post, siteConfig, base, siteConfig.permalinks?.structure ?? "plain")),
        }}
      />
      {/* Yoast-style breadcrumb trail (Home › Blog › Category › Post). */}
      <nav aria-label={t(siteConfig.language, "common.breadcrumb")} className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        <ol className="flex flex-wrap items-center gap-1.5">
          {breadcrumbItems.map((item, i) => {
            const isLast = i === breadcrumbItems.length - 1;
            return (
              <li key={item.url} className="flex items-center gap-1.5">
                {isLast ? (
                  <span className="text-zinc-700 dark:text-zinc-300" aria-current="page">
                    {item.name}
                  </span>
                ) : (
                  <>
                    <Link
                      href={item.url.replace(base, "") || "/"}
                      className="hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline transition-colors"
                    >
                      {item.name}
                    </Link>
                    <span aria-hidden="true">›</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      {post.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.coverImage}
          alt={post.title}
          className="w-full max-h-96 object-cover rounded-lg mb-8"
        />
      ) : null}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {post.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <time
            dateTime={post.date}
            className="text-sm text-zinc-500 dark:text-zinc-400"
          >
            {formattedDate}
          </time>
          {post.author ? (
            (() => {
              // Split "By {author}" so the author stays a link while honoring
              // each language's word order (e.g. de "Von", it "Di").
              const [before, after] = t(siteConfig.language, "common.by").split(
                "{author}"
              );
              return (
                <span className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  {before}
                  {authorAvatarUrl && (
                    <Avatar src={authorAvatarUrl} name={post.author} size={24} />
                  )}
                  <Link
                    href={`/blog/author/${slugifyAuthor(post.author)}`}
                    rel="author"
                    className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline transition-colors"
                  >
                    {post.author}
                  </Link>
                  {after}
                </span>
              );
            })()
          ) : null}
        </div>
        {post.categories.length > 0 && (
          <div className="mt-2">
            <CategoryChips categories={post.categories} locale={siteConfig.language} />
          </div>
        )}
        {post.tags.length > 0 && (
          <div className="mt-4">
            <TagChips tags={post.tags} locale={siteConfig.language} />
          </div>
        )}
      </header>
      <LinkPreview previews={previews}>
        <Prose html={post.html} />
      </LinkPreview>
      <RelatedPosts posts={related} timezone={siteConfig.timezone} dateFormat={siteConfig.dateFormat} locale={siteConfig.language} structure={siteConfig.permalinks?.structure ?? "plain"} />
      <Backlinks nodes={back} locale={siteConfig.language} />
      <UnlinkedMentions mentions={mentions} locale={siteConfig.language} />
      <LocalGraph view={localView} focusId={id} locale={siteConfig.language} />
      <PostNav prev={prev} next={next} locale={siteConfig.language} structure={siteConfig.permalinks?.structure ?? "plain"} />
    </>
  );
}

/**
 * Uncached bridge component: computes the posts fingerprint at request time and
 * passes it as a prop to PostBody so PostBody's 'use cache' keys on (slug, fp).
 * Mirrors the CommentsSectionWithMeta bridge pattern already in this file.
 * NOT cached — runs every request to recompute fp and detect content changes.
 * Satisfies: PPR-01, PPR-02, ROUTE-01.
 */
async function PostBodyLoader({
  slug,
  requestedPath,
}: {
  slug: string;
  requestedPath: string;
}) {
  await connection();
  const now = new Date().toISOString().slice(0, 10);

  // Fetch with includeDrafts so we can gate private/password posts ourselves
  const [post, siteConfig] = await Promise.all([
    getRepository().getPost(slug, { includeDrafts: true }),
    getRepository().getSiteConfig(),
  ]);

  if (!post) {
    // Yoast-style redirect: a removed/renamed URL may have a redirect rule.
    // Applied here (only when the post is missing) so valid pages and PPR are
    // untouched and the proxy stays off the public routes.
    const rule = matchRedirect(requestedPath, await loadRedirects());
    if (rule) {
      if (rule.permanent) permanentRedirect(rule.to);
      redirect(rule.to);
    }
    notFound();
  }
  if (isFuturePost(post, now)) notFound();
  // Draft posts are never public
  if (post.status === "draft") notFound();

  // Canonicalize the URL: if the visited path does not match the post's
  // permalink for the active structure (e.g. an old plain URL after switching to
  // a date-based structure, or a wrong date), redirect to the canonical path.
  const canonical = postPath(post, siteConfig.permalinks?.structure ?? "plain");
  if (requestedPath !== canonical) redirect(canonical);

  // Private post gate: require admin session
  if (post.visibility === "private") {
    let hasSession = false;
    try {
      const { verifySession } = await import("@/lib/auth/dal");
      await verifySession();
      hasSession = true;
    } catch {
      hasSession = false;
    }
    if (!hasSession) notFound();
  }

  // Password post gate
  if (post.visibility === "password") {
    let hasSession = false;
    try {
      const { verifySession } = await import("@/lib/auth/dal");
      await verifySession();
      hasSession = true;
    } catch {
      hasSession = false;
    }
    if (!hasSession) {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const cookieVal = cookieStore.get(`pp_${slug}`)?.value;
      if (!cookieVal || !post.password || cookieVal !== hashPostPassword(post.password)) {
        return <PasswordForm slug={slug} />;
      }
    }
  }

  const fp = await postsFingerprint();
  return <PostBody slug={slug} fp={fp} />;
}

/**
 * Cached helper: returns only post.comments (frontmatter flag) for the comments island.
 * Avoids fetching the full post body twice.
 *
 * Takes `fp` (posts area fingerprint) as an explicit argument — this makes fp part of
 * the 'use cache' key so that editing a post's `comments:` frontmatter flag reflects
 * on the next request (cache miss via changed fp), consistent with PostBody.
 * Do NOT closure-capture fp; pass it as an explicit primitive arg (use-cache.md ADR-B).
 *
 * Satisfies: REQ-PPR-09 (never touches comments DB at build time), CACHE-01.
 */
async function getPostCommentsMeta(
  slug: string,
  fp: string
): Promise<Pick<Post, "comments" | "date"> | null> {
  "use cache";
  void fp; // fp is an explicit arg solely to key the cache; not used in the body
  const repo = getRepository();
  const post = await repo.getPost(slug);
  if (!post) return null;
  return { comments: post.comments, date: post.date };
}

/**
 * Post page — PPR-safe static shell with a dynamic comments island.
 *
 * This component is NON-async (REQ-PPR-01): it does not await directly.
 * It uses React.use() to resolve params synchronously (React 19).
 * The post body and comments island are each in their own <Suspense> boundary:
 * - PostBody: 'use cache' — prerendered static HTML
 * - CommentsSection: no cache — dynamic, streamed at request time
 *
 * Satisfies: REQ-PPR-01..10, S-20, S-21.
 */
export default function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const segments = use(params).slug;
  const slug = permalinkSlug(segments) ?? "";
  // The path actually visited, used to canonicalize: a non-canonical shape
  // (e.g. a plain URL under a date-based structure) redirects to postPath().
  const requestedPath = `/blog/${segments.join("/")}`;
  const { language: loc } = use(getLayoutSiteConfig());

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 lg:flex lg:gap-12">
      <article className="mx-auto w-full max-w-3xl lg:min-w-0 lg:flex-1">
        {/*
          Static post body — prerendered via PostBody('use cache').
          Suspense boundary is required because PostBody is async.
          The fallback is included in the prerendered HTML shell.
          Satisfies: REQ-PPR-04.
        */}
        <Suspense
          fallback={
            <div className="animate-pulse">
              <div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded mb-4 w-3/4" />
            </div>
          }
        >
          <PostBodyLoader slug={slug} requestedPath={requestedPath} />
        </Suspense>

        {/*
          Comments island — dynamic, streamed at request time.
          CommentsSection calls `await connection()` as its FIRST line —
          this opts the island into request-time rendering.
          CommentsErrorBoundary catches errors propagated from CommentsSection.
          A DB outage only affects this boundary; the post body renders normally.
          Satisfies: REQ-PPR-05, REQ-PPR-06, REQ-FAIL-01, S-20.
        */}
        <CommentsErrorBoundary locale={loc}>
          <Suspense
            fallback={
              <div className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8">
                <p className="text-sm text-zinc-400 dark:text-zinc-500">{t(loc, "common.loadingComments")}</p>
              </div>
            }
          >
            <CommentsSectionWithMeta slug={slug} searchParams={searchParams} />
          </Suspense>
        </CommentsErrorBoundary>
      </article>

      {/*
        Sidebar widget island — dynamic, streamed at request time, sibling to the
        cached post body so PostBody keeps its static prerender. The parent uses
        flex (not grid) so the `lg:gap-12` only applies when the sidebar actually
        renders — a sidebar-less post keeps the original centered max-w-3xl layout
        with no leftover gutter (flex gap applies between items, never to a lone child).
      */}
      <Suspense fallback={null}>
        <PostSidebar />
      </Suspense>
    </div>
  );
}

/**
 * Bridge component: loads post.comments metadata (cached) then renders CommentsSection.
 * Keeps PostPage non-async while allowing CommentsSection to receive the comments flag.
 *
 * Computes `fp` (posts fingerprint) at request time and passes it to getPostCommentsMeta
 * so the cache key includes the fingerprint. Editing a post's `comments:` frontmatter
 * flag reflects on the next request (same mechanism as PostBodyLoader → PostBody).
 * postsFingerprint() is cheap (stat-walk, no readFile) and already uncached by design.
 */
/**
 * Sidebar widget island for the single-post view (WordPress sidebar parity).
 *
 * Rendered as a DYNAMIC sibling of the cached PostBody — never a parent — so the
 * post body keeps its static prerender (REQ-PPR-04). getWidgets() performs an
 * uncached fingerprint stat, so this must live inside its own <Suspense> boundary
 * and opts into request-time rendering via connection().
 *
 * Returns null when no widgets are configured; the parent grid's `auto` sidebar
 * track then collapses to zero width, so a sidebar-less post renders exactly as
 * before (centered, max-w-3xl) with no reserved gutter.
 */
async function PasswordForm({ slug }: { slug: string }) {
  const { language: loc } = await getLayoutSiteConfig();
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
        {t(loc, "common.passwordProtectedTitle")}
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        {t(loc, "common.passwordProtectedDesc")}
      </p>
      <PasswordUnlockForm slug={slug} locale={loc} />
    </div>
  );
}

async function PostSidebar() {
  await connection();
  const [{ "blog-sidebar": widgets }, { language: loc }] = await Promise.all([
    getWidgets(),
    getLayoutSiteConfig(),
  ]);
  if (widgets.length === 0) return null;
  return (
    <aside className="mt-12 lg:mt-0 lg:w-[280px]">
      <WidgetArea widgets={widgets} locale={loc} />
    </aside>
  );
}

async function CommentsSectionWithMeta({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const fp = await postsFingerprint();
  const meta = await getPostCommentsMeta(slug, fp);
  if (!meta) {
    notFound();
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const cpageRaw = resolvedParams["cpage"];
  const cpage = typeof cpageRaw === "string" ? parseInt(cpageRaw, 10) : 1;
  const cpageValue = Number.isFinite(cpage) && cpage > 0 ? cpage : 1;

  return (
    <CommentsSection
      slug={slug}
      postCommentsEnabled={meta.comments}
      postDate={meta.date}
      cpage={cpageValue}
    />
  );
}
