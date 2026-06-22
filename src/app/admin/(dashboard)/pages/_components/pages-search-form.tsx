import { Button } from "@/app/components/ui/button";
import { t } from "@/lib/i18n";

interface PagesSearchFormProps {
  q: string;
  locale: string;
}

/**
 * GET search form for the admin Pages list.
 * Server component — no "use client".
 * Mirrors posts-search-form.tsx without the status hidden input (pages have no status).
 *
 * No page hidden input => form submit always resets to page 1.
 */
export function PagesSearchForm({ q, locale }: PagesSearchFormProps) {
  return (
    <form
      method="GET"
      action="/admin/pages"
      role="search"
      className="flex items-center gap-2 mb-4"
    >
      <label htmlFor="pages-search" className="sr-only">
        {t(locale, "admin.pages.searchPages")}
      </label>
      <input
        id="pages-search"
        type="search"
        name="q"
        defaultValue={q}
        placeholder={t(locale, "admin.pages.searchPages") + "…"}
        autoComplete="off"
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:focus:ring-zinc-400"
      />
      <Button type="submit" variant="secondary">{t(locale, "common.search")}</Button>
    </form>
  );
}
