"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { getUserRepository } from "@/lib/auth/factory";
import { can, canEditPost, canDeletePost } from "@/lib/auth/capabilities";
import { getWriter } from "@/lib/content";

export type PostFormState =
  | { error?: string }
  | undefined;

/**
 * Read the Yoast-style SEO override fields from the editor form. Empty strings
 * become undefined; the writer's cleanSeo() drops the `seo` key entirely when
 * nothing meaningful was entered.
 */
function readSeoFromForm(formData: FormData): {
  title?: string;
  metaDescription?: string;
  focusKeyphrase?: string;
  canonical?: string;
  noindex?: boolean;
  ogImage?: string;
  cornerstone?: boolean;
} {
  const title = ((formData.get("seoTitle") as string | null) ?? "").trim();
  const metaDescription = ((formData.get("metaDescription") as string | null) ?? "").trim();
  const focusKeyphrase = ((formData.get("focusKeyphrase") as string | null) ?? "").trim();
  const canonical = ((formData.get("canonical") as string | null) ?? "").trim();
  const noindex = formData.get("noindex") === "on";
  const ogImage = ((formData.get("ogImage") as string | null) ?? "").trim();
  const cornerstone = formData.get("cornerstone") === "on";
  return {
    title: title || undefined,
    metaDescription: metaDescription || undefined,
    focusKeyphrase: focusKeyphrase || undefined,
    canonical: canonical || undefined,
    noindex: noindex || undefined,
    ogImage: ogImage || undefined,
    cornerstone: cornerstone || undefined,
  };
}

// ============================================================
// createPostAction
// ============================================================

/**
 * Server Action: create a new post.
 * verifySession() is the FIRST call — spec Authentication Guard.
 */
export async function createPostAction(
  prevState: PostFormState,
  formData: FormData
): Promise<PostFormState> {
  const session = await verifySession();

  // Resolve author label for revision context — best-effort, DB may be unavailable
  let authorLabel: string | null = null;
  let authorDisplayName: string | null = null;
  try {
    const user = await getUserRepository().findById(session.userId);
    authorLabel = user?.email ?? null;
    authorDisplayName = user?.name?.trim() || null;
  } catch {
    // DB unavailable — proceed without author label
  }

  const title = (formData.get("title") as string | null) ?? "";
  const slug = (formData.get("slug") as string | null) ?? "";
  const date = (formData.get("date") as string | null) ?? "";
  const status = (formData.get("status") as string | null) ?? "draft";
  const excerpt = (formData.get("excerpt") as string | null) ?? "";
  const coverImage = (formData.get("coverImage") as string | null) ?? "";
  const tagsRaw = (formData.get("tags") as string | null) ?? "";
  const categoriesRaw = (formData.get("categories") as string | null) ?? "";
  const commentsRaw = formData.get("comments");
  const stickyRaw = formData.get("sticky");
  const authorField = ((formData.get("author") as string | null) ?? "").trim();
  const body = (formData.get("body") as string | null) ?? "";
  const visibility = (formData.get("visibility") as string | null) ?? "public";
  const postPassword = (formData.get("postPassword") as string | null) ?? "";

  const tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const categories = categoriesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const comments = commentsRaw === "on";
  const sticky = stickyRaw === "on";
  // Author byline: use the explicit field, else prefer the user's display name,
  // then fall back to the email username prefix so every post gets a byline.
  const author = authorField || authorDisplayName || (authorLabel ? authorLabel.split("@")[0] : undefined);

  if (!can(session.role, "posts:create")) {
    return { error: "You do not have permission to perform this action." };
  }

  const result = await getWriter().createPost({
    title,
    slug: slug || undefined,
    date: date || new Date().toISOString().slice(0, 10),
    status: status === "published" ? "published" : "draft",
    excerpt: excerpt || undefined,
    coverImage: coverImage || undefined,
    tags,
    categories,
    comments,
    sticky,
    body,
    author,
    authorId: session.userId,
    visibility: (visibility === "public" || visibility === "private" || visibility === "password") ? visibility : "public",
    password: visibility === "password" ? (postPassword || undefined) : undefined,
    seo: readSeoFromForm(formData),
  }, { source: "admin", authorId: session.userId, authorLabel });

  if (!result.ok) {
    const { kind } = result.error;
    const messages: Record<string, string> = {
      invalid_frontmatter: `Validation failed: ${"issues" in result.error ? result.error.issues : "invalid input"}`,
      invalid_slug: "Invalid slug — use only lowercase letters, numbers, and hyphens.",
      slug_collision: "That slug is already taken. Please choose a different one.",
      post_not_found: "Post not found.",
    };
    return { error: messages[kind] ?? "An unexpected error occurred." };
  }

  const { slug: newSlug } = result;

  // ALL updateTag calls MUST precede redirect() — redirect() throws internally
  // and any code after it is unreachable. (ADR-4 ordering rule)
  updateTag("posts");
  updateTag(`post:${newSlug}`);
  updateTag("tags");
  updateTag("categories");
  redirect("/admin/posts");
}

// ============================================================
// updatePostAction
// ============================================================

/**
 * Server Action: update an existing post.
 * verifySession() is the FIRST call — spec Authentication Guard.
 */
export async function updatePostAction(
  prevState: PostFormState,
  formData: FormData
): Promise<PostFormState> {
  const session = await verifySession();

  // Resolve author label for revision context — best-effort, DB may be unavailable
  let authorLabel: string | null = null;
  try {
    const user = await getUserRepository().findById(session.userId);
    authorLabel = user?.email ?? null;
  } catch {
    // DB unavailable — proceed without author label
  }

  const currentSlug = (formData.get("currentSlug") as string | null) ?? "";
  if (!currentSlug) {
    return { error: "Missing current slug — cannot update." };
  }

  // Ownership gate: read authorId from existing post before mutation
  const existing = await getWriter().readRaw(currentSlug);
  const postAuthorId = (existing?.frontmatter.authorId as string | undefined) ?? null;
  if (!canEditPost(session.role, postAuthorId, session.userId)) {
    return { error: "You can only edit your own posts." };
  }

  const title = (formData.get("title") as string | null) ?? "";
  const slug = (formData.get("slug") as string | null) ?? "";
  const date = (formData.get("date") as string | null) ?? "";
  const status = (formData.get("status") as string | null) ?? "draft";
  const excerpt = (formData.get("excerpt") as string | null) ?? "";
  const coverImage = (formData.get("coverImage") as string | null) ?? "";
  const tagsRaw = (formData.get("tags") as string | null) ?? "";
  const categoriesRaw = (formData.get("categories") as string | null) ?? "";
  const commentsRaw = formData.get("comments");
  const stickyRaw = formData.get("sticky");
  const author = ((formData.get("author") as string | null) ?? "").trim();
  const body = (formData.get("body") as string | null) ?? "";
  const visibility = (formData.get("visibility") as string | null) ?? "public";
  const postPassword = (formData.get("postPassword") as string | null) ?? "";

  const tags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const categories = categoriesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const comments = commentsRaw === "on";
  const sticky = stickyRaw === "on";
  const seo = readSeoFromForm(formData);

  const result = await getWriter().updatePost(currentSlug, {
    title,
    slug: slug || undefined,
    date,
    status: status === "published" ? "published" : "draft",
    excerpt: excerpt || undefined,
    coverImage: coverImage || undefined,
    tags,
    categories,
    comments,
    sticky,
    body,
    author: author || undefined,
    visibility: (visibility === "public" || visibility === "private" || visibility === "password") ? visibility : "public",
    password: visibility === "password" ? (postPassword || undefined) : undefined,
    seo,
  }, { source: "admin", authorId: session.userId, authorLabel });

  if (!result.ok) {
    const { kind } = result.error;
    const messages: Record<string, string> = {
      invalid_frontmatter: `Validation failed: ${"issues" in result.error ? result.error.issues : "invalid input"}`,
      invalid_slug: "Invalid slug — use only lowercase letters, numbers, and hyphens.",
      slug_collision: "That slug is already taken. Please choose a different one.",
      post_not_found: "Post not found.",
    };
    return { error: messages[kind] ?? "An unexpected error occurred." };
  }

  const { slug: newSlug } = result;

  // ALL updateTag calls MUST precede redirect() — redirect() throws internally
  // and any code after it is unreachable. (ADR-4 ordering rule)
  if (newSlug !== currentSlug) {
    // Slug rename: invalidate BOTH old and new slug tags (old-slug purge + new-slug prime)
    updateTag(`post:${currentSlug}`);
    updateTag(`post:${newSlug}`);
  } else {
    updateTag(`post:${newSlug}`);
  }
  updateTag("posts");
  updateTag("tags");
  updateTag("categories");
  redirect("/admin/posts");
}

// ============================================================
// quickUpdatePostAction
// ============================================================

/**
 * Server Action: WordPress-style "Quick Edit" — update only Title, Slug, Date,
 * and Status from the list row, PRESERVING every other field.
 *
 * Read-merge-write: the existing post is read first and all non-quick fields
 * (body, excerpt, tags, categories, comments, sticky, coverImage, author,
 * visibility, password) are carried over unchanged. This is why Quick Edit can
 * NOT reuse updatePostAction — that action reads `body` from the form and would
 * blank the post content when the quick form omits it.
 */
export async function quickUpdatePostAction(formData: FormData): Promise<void> {
  const session = await verifySession();

  const currentSlug = (formData.get("currentSlug") as string | null) ?? "";
  if (!currentSlug) return;

  // Read existing post (raw frontmatter + body) before mutating.
  const existing = await getWriter().readRaw(currentSlug);
  if (!existing) return;

  const { frontmatter, body } = existing;

  // Ownership gate — mirror updatePostAction.
  const postAuthorId = (frontmatter.authorId as string | undefined) ?? null;
  if (!canEditPost(session.role, postAuthorId, session.userId)) return;

  // Resolve author label for revision context — best-effort.
  let authorLabel: string | null = null;
  try {
    const user = await getUserRepository().findById(session.userId);
    authorLabel = user?.email ?? null;
  } catch {
    // DB unavailable — proceed without author label
  }

  // Quick fields (the only ones the inline form edits).
  const title = (formData.get("title") as string | null)?.trim() || "";
  const slug = (formData.get("slug") as string | null)?.trim() || "";
  const date = (formData.get("date") as string | null) ?? "";
  const statusRaw = (formData.get("status") as string | null) ?? "draft";
  const status = statusRaw === "published" ? "published" : "draft";

  // Preserved fields — reconstructed from existing frontmatter (same guards as
  // the edit page mapping), so nothing is lost.
  const existingTags = Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [];
  const existingCategories = Array.isArray(frontmatter.categories)
    ? (frontmatter.categories as string[])
    : [];
  const visibility =
    frontmatter.visibility === "private" || frontmatter.visibility === "password"
      ? frontmatter.visibility
      : "public";

  const result = await getWriter().updatePost(
    currentSlug,
    {
      title,
      slug: slug || undefined,
      date,
      status,
      excerpt: typeof frontmatter.excerpt === "string" ? frontmatter.excerpt : undefined,
      coverImage:
        typeof frontmatter.coverImage === "string" ? frontmatter.coverImage : undefined,
      tags: existingTags,
      categories: existingCategories,
      comments: typeof frontmatter.comments === "boolean" ? frontmatter.comments : true,
      sticky: frontmatter.sticky === true,
      body,
      author: typeof frontmatter.author === "string" ? frontmatter.author : undefined,
      visibility,
      password:
        visibility === "password" && typeof frontmatter.password === "string"
          ? frontmatter.password
          : undefined,
    },
    { source: "admin", authorId: session.userId, authorLabel }
  );

  if (!result.ok) return;

  const { slug: newSlug } = result;
  if (newSlug !== currentSlug) {
    updateTag(`post:${currentSlug}`);
    updateTag(`post:${newSlug}`);
  } else {
    updateTag(`post:${newSlug}`);
  }
  updateTag("posts");
  updateTag("tags");
  updateTag("categories");
  redirect("/admin/posts");
}

// ============================================================
// bulkDeletePostsAction
// ============================================================

/**
 * Server Action: bulk-delete posts by slug. Best-effort (Promise.allSettled):
 * partial failures do not block. verifySession() is FIRST (auth guard).
 * All updateTag calls precede redirect() (ADR-4).
 */
export async function bulkDeletePostsAction(formData: FormData): Promise<void> {
  const session = await verifySession();
  const slugs = formData.getAll("slug").filter((v): v is string => typeof v === "string" && v.length > 0);
  if (slugs.length > 0) {
    const writer = getWriter();
    let allowed = slugs;
    // Authors can only delete their own posts — filter to owned slugs
    if (!can(session.role, "posts:delete:any")) {
      const checks = await Promise.all(
        slugs.map(async (s) => {
          const raw = await writer.readRaw(s);
          const aid = (raw?.frontmatter.authorId as string | undefined) ?? null;
          return canDeletePost(session.role, aid, session.userId) ? s : null;
        })
      );
      allowed = checks.filter((s): s is string => s !== null);
    }
    await Promise.allSettled(allowed.map((s) => writer.trashPost(s)));
  }
  updateTag("posts");
  updateTag("tags");
  updateTag("categories");
  redirect("/admin/posts");
}

// ============================================================
// createQuickDraftAction
// ============================================================

/**
 * Server Action: create a quick draft post from the dashboard widget.
 * verifySession() is the FIRST call — spec Authentication Guard.
 * Hardcodes status: "draft" — Quick Draft NEVER publishes.
 * Redirects to the new post editor using the writer-returned slug (ADR-4: updateTag before redirect).
 */
export async function createQuickDraftAction(
  prevState: PostFormState,
  formData: FormData
): Promise<PostFormState> {
  const session = await verifySession();

  // Resolve author label for revision context — best-effort, DB may be unavailable
  let authorLabel: string | null = null;
  try {
    const user = await getUserRepository().findById(session.userId);
    authorLabel = user?.email ?? null;
  } catch {
    // DB unavailable — proceed without author label
  }

  // RBAC fail-closed — check BEFORE reading any formData
  if (!can(session.role, "posts:create")) {
    return { error: "You do not have permission to perform this action." };
  }

  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const body = (formData.get("body") as string | null)?.trim() ?? "";

  if (!title) return { error: "Title is required." };
  if (!body) return { error: "Body is required." };

  const result = await getWriter().createPost(
    {
      title,
      date: new Date().toISOString().slice(0, 10),
      status: "draft",
      tags: [],
      categories: [],
      comments: true,
      body,
      authorId: session.userId,
    },
    { source: "admin", authorId: session.userId, authorLabel }
  );

  if (!result.ok) {
    const { kind } = result.error;
    const messages: Record<string, string> = {
      invalid_frontmatter: `Validation failed: ${"issues" in result.error ? result.error.issues : "invalid input"}`,
      invalid_slug: "Invalid slug — use only lowercase letters, numbers, and hyphens.",
      slug_collision: "That slug is already taken. Please choose a different one.",
      post_not_found: "Post not found.",
    };
    return { error: messages[kind] ?? "An unexpected error occurred." };
  }

  const { slug: newSlug } = result;

  // ALL updateTag calls MUST precede redirect() — redirect() throws internally
  // and any code after it is unreachable. (ADR-4 ordering rule)
  updateTag("posts");
  updateTag(`post:${newSlug}`);
  updateTag("tags");
  updateTag("categories");
  redirect(`/admin/posts/${newSlug}/edit`);
}

// ============================================================
// bulkSetPostStatusAction
// ============================================================

/**
 * Server Action: bulk-set post status (published/draft).
 * Ownership rule mirrors bulk-delete: authors filtered by canEditPost.
 * verifySession() is FIRST (auth guard). ADR-4: all updateTag before redirect.
 */
export async function bulkSetPostStatusAction(formData: FormData): Promise<void> {
  const session = await verifySession();
  const slugs = formData.getAll("slug").filter((v): v is string => typeof v === "string" && v.length > 0);
  const statusRaw = formData.get("status");
  const status = statusRaw === "published" ? "published" : "draft";

  if (slugs.length > 0) {
    const writer = getWriter();
    let allowed = slugs;
    if (!can(session.role, "posts:delete:any")) {
      const checks = await Promise.all(
        slugs.map(async (s) => {
          const raw = await writer.readRaw(s);
          const aid = (raw?.frontmatter.authorId as string | undefined) ?? null;
          return canEditPost(session.role, aid, session.userId) ? s : null;
        })
      );
      allowed = checks.filter((s): s is string => s !== null);
    }
    await Promise.allSettled(allowed.map((s) => writer.setPostStatus(s, status)));
  }
  updateTag("posts");
  updateTag("tags");
  updateTag("categories");
  redirect("/admin/posts");
}

// ============================================================
// deletePostAction
// ============================================================

/**
 * Server Action: delete a post.
 * verifySession() is the FIRST call — spec Authentication Guard.
 * Confirmation gesture: the form button on the list page is the gesture (spec allows form-based).
 */
export async function deletePostAction(slug: string): Promise<void> {
  const session = await verifySession();

  // Ownership gate: read authorId from existing post before deletion
  const existing = await getWriter().readRaw(slug);
  const postAuthorId = (existing?.frontmatter.authorId as string | undefined) ?? null;
  if (!canDeletePost(session.role, postAuthorId, session.userId)) {
    redirect("/admin/posts");
    return;
  }

  // Soft-delete: move to trash instead of permanent deletion
  await getWriter().trashPost(slug);

  // ALL updateTag calls MUST precede redirect() — redirect() throws internally
  // and any code after it is unreachable. (ADR-4 ordering rule)
  updateTag("posts");
  updateTag(`post:${slug}`);
  updateTag("tags");
  updateTag("categories");
  redirect("/admin/posts");
}

// ============================================================
// restorePostAction
// ============================================================

export async function restorePostAction(slug: string): Promise<void> {
  const session = await verifySession();

  const existing = await getWriter().readRaw(slug);
  // Post is in trash (not live) — readRaw returns null. Use null postAuthorId.
  const postAuthorId = (existing?.frontmatter.authorId as string | undefined) ?? null;
  if (!canDeletePost(session.role, postAuthorId, session.userId)) {
    redirect("/admin/posts");
    return;
  }

  await getWriter().restorePost(slug);

  updateTag("posts");
  updateTag(`post:${slug}`);
  updateTag("tags");
  updateTag("categories");
  redirect("/admin/posts/trash");
}

// ============================================================
// permanentlyDeletePostAction
// ============================================================

export async function permanentlyDeletePostAction(slug: string): Promise<void> {
  const session = await verifySession();

  if (!canDeletePost(session.role, null, session.userId)) {
    redirect("/admin/posts/trash");
    return;
  }

  await getWriter().permanentlyDeletePost(slug);

  updateTag("posts");
  updateTag(`post:${slug}`);
  updateTag("tags");
  updateTag("categories");
  redirect("/admin/posts/trash");
}
