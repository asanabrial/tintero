import Link from "next/link";
import type { GraphNode } from "@/lib/content/links";
import { t } from "@/lib/i18n";

interface BacklinksProps {
  nodes: GraphNode[];
  locale?: string;
}

/**
 * Server component — renders an Obsidian-style "Linked from" section listing the
 * posts/pages that link to the current one. Returns null when there are none
 * (omits the heading entirely).
 */
export function Backlinks({ nodes, locale }: BacklinksProps) {
  const loc = locale ?? "en";
  if (nodes.length === 0) return null;

  return (
    <section
      className="mt-16 border-t border-zinc-200 dark:border-zinc-800 pt-8"
      aria-label={t(loc, "common.backlinks")}
    >
      <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t(loc, "common.linkedFrom")}
      </h2>
      <ul className="mt-6 space-y-2">
        {nodes.map((n) => (
          <li key={n.id}>
            <Link
              href={n.url}
              className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline underline-offset-4 transition-colors"
            >
              <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-500">
                ↳
              </span>
              {n.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
