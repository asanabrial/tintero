// Edit post page — server component.
// verifySession() is called FIRST inside the inner async component.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { getWriter, getRepository, getLayoutSiteConfig } from "@/lib/content";
import { getUserRepository } from "@/lib/auth/factory";
import { t } from "@/lib/i18n";
import { PostForm } from "../../post-form";
import { updatePostAction } from "../../actions";
import type { PostFormInitial } from "../../post-form";

interface EditPostContentProps {
  params: Promise<{ slug: string }>;
}

async function EditPostContent({ params }: EditPostContentProps) {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const { slug } = await params;

  // getWriter().readRaw bypasses the cached repository to get the raw file
  // (not rendered HTML) — keeps the cached read path intact.
  const repo = getRepository();
  const [raw, config, categories, tags, users] = await Promise.all([
    getWriter().readRaw(slug),
    repo.getSiteConfig(),
    repo.listCategories(),
    repo.listTags(),
    getUserRepository()
      .listUsers()
      .catch(() => []), // author list is best-effort
  ]);
  if (!raw) {
    notFound();
  }

  const { frontmatter, body } = raw;

  // Map raw frontmatter to PostFormInitial
  // tags array → comma-separated string for the text input
  const initial: PostFormInitial = {
    title: typeof frontmatter.title === "string" ? frontmatter.title : "",
    slug: typeof frontmatter.slug === "string" ? frontmatter.slug : slug,
    date:
      frontmatter.date instanceof Date
        ? frontmatter.date.toISOString().slice(0, 10)
        : typeof frontmatter.date === "string"
          ? frontmatter.date
          : "",
    status:
      frontmatter.status === "published" || frontmatter.status === "draft"
        ? frontmatter.status
        : "draft",
    excerpt: typeof frontmatter.excerpt === "string" ? frontmatter.excerpt : "",
    coverImage: typeof frontmatter.coverImage === "string" ? frontmatter.coverImage : "",
    author: typeof frontmatter.author === "string" ? frontmatter.author : "",
    tags: Array.isArray(frontmatter.tags)
      ? (frontmatter.tags as string[]).join(", ")
      : "",
    categories: Array.isArray(frontmatter.categories)
      ? (frontmatter.categories as string[]).join(", ")
      : "",
    comments: typeof frontmatter.comments === "boolean" ? frontmatter.comments : true,
    sticky: frontmatter.sticky === true,
    visibility: (frontmatter.visibility === "private" || frontmatter.visibility === "password")
      ? frontmatter.visibility
      : "public",
    postPassword: frontmatter.visibility === "password" && typeof frontmatter.password === "string"
      ? frontmatter.password
      : "",
    body: body.trim(),
    seo:
      frontmatter.seo && typeof frontmatter.seo === "object"
        ? (frontmatter.seo as {
            title?: string;
            metaDescription?: string;
            focusKeyphrase?: string;
            canonical?: string;
            noindex?: boolean;
            ogImage?: string;
            cornerstone?: boolean;
          })
        : undefined,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t(loc, "admin.posts.editPost")}</h1>
        <a
          href={`/admin/posts/${slug}/revisions`}
          className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline"
        >
          {t(loc, "admin.revisions.title")}
        </a>
      </div>
      <PostForm
        action={updatePostAction}
        initial={initial}
        currentSlug={slug}
        categories={categories.map((c) => ({
          slug: c.slug,
          label: c.label,
          count: c.count,
          depth: c.depth,
        }))}
        tags={tags.map((t) => ({ slug: t.slug, label: t.label, count: t.count }))}
        authors={users.map((u) => ({ name: u.name, email: u.email }))}
        baseUrl={config.baseUrl}
      />
    </div>
  );
}

export default function EditPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <EditPostContent params={params} />
    </Suspense>
  );
}
