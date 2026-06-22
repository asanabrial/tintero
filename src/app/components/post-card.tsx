import Link from "next/link";
import { TagChips } from "./tag-chips";
import { slugifyAuthor } from "@/lib/content";
import type { Post } from "@/lib/content";
import { formatSiteDate } from "@/lib/content/format-date";
import { t } from "@/lib/i18n";
import { postPath, type PermalinkStructure } from "@/lib/content/permalink";

interface PostCardProps {
  post: Post;
  timezone?: string;
  dateFormat?: string;
  locale?: string;
  structure?: PermalinkStructure;
}

export function PostCard({ post, timezone, dateFormat, locale, structure }: PostCardProps) {
  const loc = locale ?? "en";
  const formattedDate = formatSiteDate(post.date, { timezone, dateFormat, locale });
  const [byBefore, byAfter] = t(loc, "common.by").split("{author}");

  return (
    <article className="group">
      {post.coverImage ? (
        <Link href={postPath(post, structure ?? "plain")} className="block mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.coverImage}
            loading="lazy"
            alt={post.title}
            className="w-full h-48 object-cover rounded-md"
          />
        </Link>
      ) : null}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href={postPath(post, structure ?? "plain")} className="block">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
            {post.title}
          </h2>
        </Link>
        {post.sticky ? (
          <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
            {t(loc, "common.featured")}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-zinc-500 dark:text-zinc-400">
        <time dateTime={post.date}>{formattedDate}</time>
        {post.author ? (
          <span>
            {byBefore}
            <Link
              href={`/blog/author/${slugifyAuthor(post.author)}`}
              rel="author"
              className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline transition-colors"
            >
              {post.author}
            </Link>
            {byAfter}
          </span>
        ) : null}
      </div>
      {post.excerpt ? (
        <p className="mt-2 text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">
          {post.excerpt}
        </p>
      ) : null}
      {post.tags.length > 0 ? (
        <div className="mt-3">
          <TagChips tags={post.tags} locale={loc} />
        </div>
      ) : null}
    </article>
  );
}
