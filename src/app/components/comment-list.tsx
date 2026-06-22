import type { CommentThread } from "@/lib/comments";
import { t } from "@/lib/i18n";
import { CommentItem } from "./comment-item";

interface CommentListProps {
  threads: CommentThread[];
  timezone?: string;
  locale?: string;
  maxDepth?: number;
}

/**
 * Renders a threaded comment list.
 * Threads are ordered oldest-first (enforced by the adapter).
 * Replies render immediately under their parent, also oldest-first.
 * Satisfies: REQ-CS-03, REQ-THREAD-05, S-19.
 */
export function CommentList({ threads, timezone, locale, maxDepth }: CommentListProps) {
  const loc = locale ?? "en";

  if (threads.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {t(loc, "common.noCommentsYet")}
      </p>
    );
  }

  return (
    <ol className="space-y-6 list-none" aria-label={t(loc, "common.comments")}>
      {threads.map(({ comment, replies }) => (
        <li key={comment.id} className="space-y-4">
          <CommentItem comment={comment} depth={0} maxDepth={maxDepth ?? 0} timezone={timezone} locale={loc} />
          {replies.length > 0 && (
            <ol className="space-y-4 list-none" aria-label={t(loc, "common.repliesTo", { name: comment.authorName })}>
              {replies.map((reply) => (
                <li key={reply.id}>
                  <CommentItem comment={reply} isReply depth={1} maxDepth={maxDepth ?? 0} timezone={timezone} locale={loc} />
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}
