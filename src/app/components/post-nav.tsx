import Link from "next/link";
import type { Post } from "@/lib/content";
import { t } from "@/lib/i18n";
import { postPath, type PermalinkStructure } from "@/lib/content/permalink";

interface PostNavProps {
  prev: Post | null;
  next: Post | null;
  locale?: string;
  structure?: PermalinkStructure;
}

/**
 * Server component — renders a prev/next navigation bar.
 * Returns null when both prev and next are null (omits nav entirely).
 * The null side uses a spacer span (no disabled placeholder) so the
 * present side stays aligned via flex justify-between.
 */
export function PostNav({ prev, next, locale, structure }: PostNavProps) {
  if (!prev && !next) return null;
  const loc = locale ?? "en";

  return (
    <nav
      aria-label={t(loc, "common.postNavigation")}
      className="mt-12 flex items-stretch justify-between gap-4 border-t border-zinc-200 dark:border-zinc-800 pt-8 text-sm"
    >
      {prev ? (
        <Link href={postPath(prev, structure ?? "plain")} rel="prev" className="group max-w-[45%]">
          <span className="block text-zinc-400 dark:text-zinc-500">{t(loc, "common.previous")}</span>
          <span className="block font-medium text-zinc-900 group-hover:text-zinc-600 dark:text-zinc-50 dark:group-hover:text-zinc-300">
            ← {prev.title}
          </span>
        </Link>
      ) : (
        <span aria-hidden />
      )}
      {next ? (
        <Link
          href={postPath(next, structure ?? "plain")}
          rel="next"
          className="group max-w-[45%] text-right"
        >
          <span className="block text-zinc-400 dark:text-zinc-500">{t(loc, "common.next")}</span>
          <span className="block font-medium text-zinc-900 group-hover:text-zinc-600 dark:text-zinc-50 dark:group-hover:text-zinc-300">
            {next.title} →
          </span>
        </Link>
      ) : (
        <span aria-hidden />
      )}
    </nav>
  );
}
