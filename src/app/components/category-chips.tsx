import Link from "next/link";
import { slugifyCategory } from "@/lib/content/category";
import { t } from "@/lib/i18n";

interface CategoryChipsProps {
  categories: string[];
  locale?: string;
}

export function CategoryChips({ categories, locale }: CategoryChipsProps) {
  const loc = locale ?? "en";
  if (categories.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2" aria-label={t(loc, "common.categories")}>
      {categories.map((raw) => {
        const segments = slugifyCategory(raw);
        if (segments.length === 0) return null;
        const href = `/blog/categories/${segments.join("/")}`;
        const label = raw.split("/").pop()?.trim() ?? raw;
        return (
          <li key={raw}>
            <Link
              href={href}
              className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
