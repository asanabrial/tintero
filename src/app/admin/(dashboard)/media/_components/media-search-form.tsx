import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";

interface MediaSearchFormProps {
  q: string;
}

/**
 * GET search form for the admin Media library.
 * Server component — no "use client".
 * Mirrors users-search-form.tsx.
 *
 * No page hidden input — media is unpaginated.
 */
export async function MediaSearchForm({ q }: MediaSearchFormProps) {
  const { language: loc } = await getLayoutSiteConfig();

  return (
    <form
      method="GET"
      action="/admin/media"
      role="search"
      className="flex items-center gap-2 mb-4"
    >
      <label htmlFor="media-search" className="sr-only">
        {t(loc, "admin.media.searchMedia")}
      </label>
      <input
        id="media-search"
        type="search"
        name="q"
        defaultValue={q}
        placeholder={t(loc, "admin.media.searchMedia") + "…"}
        autoComplete="off"
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:focus:ring-zinc-400"
      />
      <button
        type="submit"
        className="inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      >
        {t(loc, "common.search")}
      </button>
    </form>
  );
}
