import Link from "next/link";
import { t } from "@/lib/i18n";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath?: string;
  locale?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  basePath = "/blog",
  locale,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const loc = locale ?? "en";
  const prevPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = currentPage < totalPages ? currentPage + 1 : null;

  function pageHref(page: number): string {
    if (page === 1) return basePath;
    return `${basePath}/page/${page}`;
  }

  return (
    <nav
      aria-label={t(loc, "common.pagination")}
      className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800"
    >
      <div>
        {prevPage !== null ? (
          <Link
            href={pageHref(prevPage)}
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
            aria-label={t(loc, "common.previousPage")}
          >
            &larr; {t(loc, "common.previous")}
          </Link>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-600">
            &larr; {t(loc, "common.previous")}
          </span>
        )}
      </div>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        {t(loc, "common.page", { page: currentPage, total: totalPages })}
      </span>
      <div>
        {nextPage !== null ? (
          <Link
            href={pageHref(nextPage)}
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
            aria-label={t(loc, "common.nextPage")}
          >
            {t(loc, "common.next")} &rarr;
          </Link>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-600">
            {t(loc, "common.next")} &rarr;
          </span>
        )}
      </div>
    </nav>
  );
}
