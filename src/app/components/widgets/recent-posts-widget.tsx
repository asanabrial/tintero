import Link from "next/link";
import type { Post } from "@/lib/content";
import { t } from "@/lib/i18n";
import { postPath, type PermalinkStructure } from "@/lib/content/permalink";

interface RecentPostsWidgetProps {
  title: string;
  posts: Pick<Post, "slug" | "title" | "date">[];
  locale?: string;
  structure?: PermalinkStructure;
}

export function RecentPostsWidget({ title, posts, locale, structure }: RecentPostsWidgetProps) {
  const loc = locale ?? "en";
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={postPath(post, structure ?? "plain")}
              className="block px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              {post.title}
            </Link>
          </li>
        ))}
        {posts.length === 0 && (
          <li className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t(loc, "common.noPostsShort")}
          </li>
        )}
      </ul>
    </section>
  );
}
