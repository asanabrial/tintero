import { GraphView } from "@/app/components/graph-view";
import type { GraphView as GraphViewData } from "@/lib/content/links";
import { t } from "@/lib/i18n";

interface LocalGraphProps {
  view: GraphViewData;
  /** The current note's node id, rendered as the focused center. */
  focusId: string;
  locale?: string;
}

/**
 * Server component — Obsidian-style "Local graph": the current note plus its
 * immediate neighbors. Renders nothing when the note has no connections (a lone
 * node carries no information), keeping link-less posts visually unchanged.
 */
export function LocalGraph({ view, focusId, locale }: LocalGraphProps) {
  const loc = locale ?? "en";
  if (view.links.length === 0) return null;

  return (
    <section
      className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8"
      aria-label={t(loc, "common.localGraph")}
    >
      <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t(loc, "common.localGraph")}
      </h2>
      <p className="mt-1 mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        {t(loc, "common.localGraphSubtext")}
      </p>
      <GraphView nodes={view.nodes} links={view.links} focusId={focusId} compact locale={loc} />
    </section>
  );
}
