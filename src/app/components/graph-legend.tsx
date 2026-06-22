import { t } from "@/lib/i18n";

/**
 * GraphLegend — small static legend for the relationship graph.
 * Server component (no interactivity).
 */
export function GraphLegend({ locale }: { locale?: string }) {
  const loc = locale ?? "en";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full bg-indigo-500" />
        {t(loc, "common.legendPost")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
        {t(loc, "common.legendPage")}
      </span>
      <span className="text-zinc-400 dark:text-zinc-500">
        {t(loc, "common.legendHint")}
      </span>
    </div>
  );
}
