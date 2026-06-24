import type { PublicComment } from "@/lib/comments";
import { formatSiteDate } from "@/lib/content/format-date";
import { t } from "@/lib/i18n";
import { Avatar } from "./avatar";

interface CommentItemProps {
  comment: PublicComment;
  /** If true, renders as an indented reply. */
  isReply?: boolean;
  /** Current nesting depth (0 = top-level, 1 = direct reply). */
  depth?: number;
  /** Max allowed nesting depth (0 = unlimited). */
  maxDepth?: number;
  timezone?: string;
  locale?: string;
}

/**
 * Renders a single comment. Body is rendered as escaped text — NO dangerouslySetInnerHTML.
 * Satisfies: REQ-CS-04, S-17 (XSS prevention).
 */
export function CommentItem({ comment, isReply = false, depth = 0, maxDepth = 0, timezone, locale }: CommentItemProps) {
  const formattedDate = formatSiteDate(comment.createdAt.toISOString(), {
    timezone,
    dateFormat: "long",
    locale,
  });

  return (
    <article
      id={`comment-${comment.id}`}
      className={isReply ? "ml-8 border-l-2 border-zinc-200 dark:border-zinc-700 pl-4" : ""}
    >
      <header className="flex flex-wrap items-start gap-x-2 gap-y-1 mb-2">
        {comment.avatarUrl && (
          <Avatar src={comment.avatarUrl} name={comment.authorName} size={40} className="mt-0.5 shrink-0" />
        )}
        <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
          {comment.authorName}
        </span>
        {comment.authorUrl && (
          <a
            href={comment.authorUrl}
            rel="nofollow noopener noreferrer"
            target="_blank"
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:underline"
          >
            {comment.authorUrl}
          </a>
        )}
        <time
          dateTime={comment.createdAt.toISOString()}
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          {formattedDate}
        </time>
        {!isReply && (maxDepth === 0 || depth < maxDepth) && (
          <a
            href={`?replyTo=${comment.id}#comment-form`}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:underline ml-auto"
          >
            {t(locale ?? "en", "common.reply")}
          </a>
        )}
      </header>
      {/* Body rendered as plain text — React escapes by default (REQ-CS-04 / S-17) */}
      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
        {comment.body}
      </p>
    </article>
  );
}
