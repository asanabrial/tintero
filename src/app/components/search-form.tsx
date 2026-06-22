import { t } from "@/lib/i18n";

interface SearchFormProps {
  defaultValue?: string;
  locale?: string;
}

/**
 * Synchronous GET form that navigates to /blog/search?s=<term>.
 * No "use client" — plain HTML form; works without JavaScript.
 * defaultValue is optional; pass it from the async SearchResults child only
 * (inside Suspense) to avoid forcing the shell into dynamic rendering.
 */
export function SearchForm({ defaultValue, locale }: SearchFormProps) {
  const loc = locale ?? "en";
  return (
    <form method="GET" action="/blog/search" role="search" className="flex items-center gap-2">
      <label htmlFor="site-search" className="sr-only">
        {t(loc, "common.searchPosts")}
      </label>
      <input
        id="site-search"
        type="search"
        name="s"
        defaultValue={defaultValue}
        placeholder={t(loc, "common.searchPlaceholder")}
        autoComplete="off"
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:focus:ring-zinc-400"
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
