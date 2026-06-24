import Link from "next/link";
import type { PublicComment } from "@/lib/comments/types";
import { t } from "@/lib/i18n";

interface RecentCommentsWidgetProps {
  title: string;
  comments: PublicComment[];
  locale?: string;
}

export function RecentCommentsWidget({
  title,
  comments,
  locale,
}: RecentCommentsWidgetProps) {
  const loc = locale ?? "en";
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {comments.map((comment) => {
          const excerpt =
            comment.body.length > 60
              ? comment.body.slice(0, 60).trimEnd() + "…"
              : comment.body;
          return (
            <li key={comment.id}>
              <Link
                href={`/blog/${comment.postSlug}#comment-${comment.id}`}
                className="block px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <span className="font-medium">{comment.authorName}</span>
                <span className="ml-1 text-zinc-500 dark:text-zinc-400">{excerpt}</span>
              </Link>
            </li>
          );
        })}
        {comments.length === 0 && (
          <li className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t(loc, "common.noComments")}
          </li>
        )}
      </ul>
    </section>
  );
}
