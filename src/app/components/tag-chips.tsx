import Link from "next/link";
import { t } from "@/lib/i18n";

interface TagChipsProps {
  tags: string[];
  locale?: string;
}

export function TagChips({ tags, locale }: TagChipsProps) {
  const loc = locale ?? "en";
  if (tags.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label={t(loc, "common.tags")}>
      {tags.map((tag) => (
        <li key={tag}>
          <Link
            href={`/blog/tags/${tag}`}
            className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            {tag}
          </Link>
        </li>
      ))}
    </ul>
  );
}
