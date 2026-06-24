import Link from "next/link";
import type { ArchiveBucket } from "@/lib/widgets/build-archives";
import { t } from "@/lib/i18n";

interface ArchivesWidgetProps {
  title: string;
  buckets: ArchiveBucket[];
  locale?: string;
}

export function ArchivesWidget({ title, buckets, locale }: ArchivesWidgetProps) {
  const loc = locale ?? "en";
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {buckets.map((bucket) => (
          <li key={bucket.href}>
            <Link
              href={bucket.href}
              className="flex items-center justify-between px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <span>{bucket.label}</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{bucket.count}</span>
            </Link>
          </li>
        ))}
        {buckets.length === 0 && (
          <li className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t(loc, "common.noArchives")}
          </li>
        )}
      </ul>
    </section>
  );
}
