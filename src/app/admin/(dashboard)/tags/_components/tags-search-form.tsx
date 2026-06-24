import { t } from "@/lib/i18n";
import { Button } from "@/app/components/ui/button";

interface TagsSearchFormProps {
  q: string;
  loc: string;
}

/**
 * GET search form for the admin Tags list.
 * Server component — no "use client".
 * Mirrors users-search-form.tsx.
 *
 * No page hidden input => form submit always resets to page 1.
 */
export function TagsSearchForm({ q, loc }: TagsSearchFormProps) {
  return (
    <form
      method="GET"
      action="/admin/tags"
      role="search"
      className="flex items-center gap-2 mb-4"
    >
      <label htmlFor="tags-search" className="sr-only">
        {t(loc, "admin.taxonomy.searchTags")}
      </label>
      <input
        id="tags-search"
        type="search"
        name="q"
        defaultValue={q}
        placeholder={t(loc, "admin.taxonomy.searchTagsPlaceholder")}
        autoComplete="off"
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:focus:ring-zinc-400"
      />
      <Button type="submit" variant="secondary">{t(loc, "common.search")}</Button>
    </form>
  );
}
