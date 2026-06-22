import Link from "next/link";
import type { Tag } from "@/lib/content";
import { t } from "@/lib/i18n";

interface TagCloudWidgetProps {
  title: string;
  tags: Tag[];
  locale?: string;
}

export function TagCloudWidget({ title, tags, locale }: TagCloudWidgetProps) {
  const loc = locale ?? "en";
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      </div>
      <div className="px-4 py-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Link
            key={tag.slug}
            href={`/blog/tags/${tag.slug}`}
            className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            {tag.label}
          </Link>
        ))}
        {tags.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(loc, "common.noTags")}</p>
        )}
      </div>
    </section>
  );
}
