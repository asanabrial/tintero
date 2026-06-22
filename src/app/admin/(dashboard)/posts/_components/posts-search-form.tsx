import type { AdminStatus } from "@/lib/content";
import { Button } from "@/app/components/ui/button";
import { t } from "@/lib/i18n";

interface PostsSearchFormProps {
  status: AdminStatus | "all";
  q: string;
  locale: string;
}

/**
 * GET search form for the admin Posts list.
 * Server component — no "use client".
 * Mirrors src/app/components/search-form.tsx for progressive enhancement.
 *
 * The hidden status input is emitted only when status !== "all" so the
 * resulting URL matches the buildPostsListHref contract exactly:
 *   /admin/posts?q=term           (status "all")
 *   /admin/posts?status=draft&q=term  (status "draft")
 *
 * No page hidden input → form submit always resets to page 1.
 */
export function PostsSearchForm({ status, q, locale }: PostsSearchFormProps) {
  return (
    <form
      method="GET"
      action="/admin/posts"
      role="search"
      className="flex items-center gap-2 mb-4"
    >
      {status !== "all" && (
        <input type="hidden" name="status" value={status} />
      )}
      <label htmlFor="posts-search" className="sr-only">
        {t(locale, "admin.posts.searchPosts")}
      </label>
      <input
        id="posts-search"
        type="search"
        name="q"
        defaultValue={q}
        placeholder={t(locale, "admin.posts.searchPosts") + "…"}
        autoComplete="off"
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:focus:ring-zinc-400"
      />
      <Button type="submit" variant="secondary">{t(locale, "common.search")}</Button>
    </form>
  );
}
