// New post page — server component.
// verifySession() is called FIRST inside the inner async component.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getRepository } from "@/lib/content";
import { getUserRepository } from "@/lib/auth/factory";
import { PostForm } from "../post-form";
import { createPostAction } from "../actions";

async function NewPostContent() {
  await verifySession();

  // Compute today's date AT REQUEST TIME — NOT at module scope.
  // Per spec: default date is the request-time date; must not be hoisted/cached.
  // (server-no-shared-module-state: request-time date must live inside the async fn)
  const defaultDate = new Date().toISOString().slice(0, 10);
  const repo = getRepository();
  const [config, categories, tags, users] = await Promise.all([
    repo.getSiteConfig(), // warm-cached (site-config tag)
    repo.listCategories(),
    repo.listTags(),
    getUserRepository()
      .listUsers()
      .catch(() => []), // author list is best-effort — never block post creation
  ]);

  // No page <h1> here — the WordPress-style EditorShell is the full screen and
  // carries the document title itself (like Gutenberg, which has no page header).
  return (
    <PostForm
      action={createPostAction}
      initial={{
        date: defaultDate,
        status: config.writing?.default_post_status ?? "draft",
        categories: config.writing?.default_post_category ?? "",
        comments: true,
      }}
      categories={categories.map((c) => ({
        slug: c.slug,
        label: c.label,
        count: c.count,
        depth: c.depth,
      }))}
      tags={tags.map((tag) => ({ slug: tag.slug, label: tag.label, count: tag.count }))}
      authors={users.map((u) => ({ name: u.name, email: u.email }))}
      baseUrl={config.baseUrl}
    />
  );
}

export default function NewPostPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <NewPostContent />
    </Suspense>
  );
}
