import { PostCard } from "./post-card";
import type { Post } from "@/lib/content";
import { t } from "@/lib/i18n";
import { type PermalinkStructure } from "@/lib/content/permalink";

interface RelatedPostsProps {
  posts: Post[];
  timezone?: string;
  dateFormat?: string;
  locale?: string;
  structure?: PermalinkStructure;
}

/**
 * Server component — renders a "Related posts" section using PostCard.
 * Returns null when the list is empty (omits section AND heading entirely).
 */
export function RelatedPosts({ posts, timezone, dateFormat, locale, structure }: RelatedPostsProps) {
  if (posts.length === 0) return null;

  return (
    <section className="mt-16 border-t border-zinc-200 dark:border-zinc-800 pt-8">
      <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t(locale ?? "en", "common.relatedPosts")}
      </h2>
      <ul className="mt-6 space-y-10" aria-label={t(locale ?? "en", "common.relatedPosts")}>
        {posts.map((p) => (
          <li key={p.slug}>
            <PostCard post={p} timezone={timezone} dateFormat={dateFormat} locale={locale} structure={structure} />
          </li>
        ))}
      </ul>
    </section>
  );
}
