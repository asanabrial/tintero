import Link from "next/link";
import type { UnlinkedMention } from "@/lib/content/links";
import { t } from "@/lib/i18n";

interface UnlinkedMentionsProps {
  mentions: UnlinkedMention[];
  locale?: string;
}

/**
 * Server component — Obsidian-style "Unlinked mentions": notes that name this
 * one in prose without linking to it. Returns null when there are none.
 */
export function UnlinkedMentions({ mentions, locale }: UnlinkedMentionsProps) {
  const loc = locale ?? "en";
  if (mentions.length === 0) return null;

  return (
    <section
      className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8"
      aria-label={t(loc, "common.unlinkedMentions")}
    >
      <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t(loc, "common.unlinkedMentions")}
      </h2>
      <ul className="mt-6 space-y-2">
        {mentions.map((m) => (
          <li key={m.id}>
            <Link
              href={m.url}
              className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 hover:underline underline-offset-4 transition-colors"
            >
              <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-500">
                ＃
              </span>
              {m.title}
              {m.count > 1 ? (
                <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {m.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
