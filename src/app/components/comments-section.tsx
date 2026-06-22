import { connection } from "next/server";
import { getCommentRepository } from "@/lib/comments";
import { getRepository } from "@/lib/content";
import { areCommentsClosed } from "@/lib/comments/close-window";
import { capThreadDepth, paginateThreads } from "@/lib/comments/thread-utils";
import { t } from "@/lib/i18n";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";

interface CommentsSectionProps {
  slug: string;
  /** From post frontmatter — whether this post has comments open. */
  postCommentsEnabled: boolean;
  /** Post date (YYYY-MM-DD) — used for the "close after N days" discussion setting. */
  postDate?: string;
  /** Current comment page (1-based). Defaults to 1. */
  cpage?: number;
}

/**
 * Async RSC comments island.
 *
 * FIRST call: await connection() — opts this island into request-time rendering.
 * Without it, the DB read could complete synchronously and be inlined into the
 * prerendered shell. See Next.js docs: connection.md "Synchronous database drivers".
 *
 * ALL dynamic reads happen AFTER connection():
 * - loadSiteConfig() (fs.readFile) — must not run at build/prerender time
 * - getCommentRepository() — must not run at build time (DATABASE_URL may be absent)
 * - formStartedAt (new Date()) — fresh per request for anti-spam effectiveness
 *
 * try/catch around DB reads: on any error, renders a graceful fallback.
 * CommentsSection is NEVER decorated with 'use cache'.
 *
 * replyTo (?replyTo=id) is read client-side in CommentForm via useSearchParams().
 *
 * Satisfies: REQ-PPR-05, REQ-PPR-06, REQ-PPR-07, REQ-PPR-08,
 *            REQ-CS-01..05, REQ-SPAM-03, REQ-FAIL-01, REQ-FAIL-02.
 */
export async function CommentsSection({
  slug,
  postCommentsEnabled,
  postDate,
  cpage,
}: CommentsSectionProps) {
  // REQUIRED: opt into dynamic (request-time) rendering before any IO.
  // ALL reads below this line happen at request time, never at build time.
  await connection();

  // Load site config here (inside the dynamic boundary) so it doesn't run during prerender.
  const siteConfig = await getRepository().getSiteConfig();

  const loc = siteConfig.language;

  // Comments disabled check (REQ-PPR-08 / REQ-CFG-05 / S-15 / S-16)
  if (!siteConfig.comments.enabled || !postCommentsEnabled) {
    return (
      <section
        aria-label={t(loc, "common.comments")}
        className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8"
      >
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(loc, "common.commentsClosed")}</p>
      </section>
    );
  }

  // DB read with graceful fallback on error (REQ-FAIL-01 / REQ-FAIL-02 / REQ-PPR-06 / S-20 / S-22)
  let threads;
  let count: number;
  try {
    const repo = getCommentRepository();
    [threads, count] = await Promise.all([
      repo.listApproved(slug),
      repo.countApproved(slug),
    ]);
  } catch {
    return (
      <section
        aria-label={t(loc, "common.comments")}
        className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8"
      >
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t(loc, "common.commentsUnavailable")}
        </p>
      </section>
    );
  }

  // formStartedAt: generated at request time (inside connection() boundary) — always fresh.
  // Cannot be inside PostPage's 'use cache' scope since it must change per request.
  // Satisfies: REQ-SPAM-03, REQ-FORM-04.
  const formStartedAt = new Date().toISOString();

  // "Close comments after N days" discussion setting — request-time age check
  // (this island is already dynamic). Existing comments stay visible; only the
  // form is replaced with a closed note.
  const formClosed = postDate
    ? areCommentsClosed(postDate, siteConfig.comments.close_after_days ?? 0, formStartedAt)
    : false;

  // Apply max_depth and per_page settings
  const maxDepth = siteConfig.comments.max_depth ?? 0;
  const perPage = siteConfig.comments.per_page ?? 0;
  const currentPage = cpage ?? 1;

  const cappedThreads = capThreadDepth(threads, maxDepth);
  const { items: pagedThreads, totalPages } = paginateThreads(cappedThreads, currentPage, perPage);

  // REQ-CS-05: count label (singular vs plural)
  const countLabel = t(loc, count === 1 ? "common.commentsCountOne" : "common.commentsCount", { count });

  return (
    <section
      aria-label={t(loc, "common.comments")}
      className="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-8"
    >
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-6">
        {countLabel}
      </h2>

      <CommentList threads={pagedThreads} timezone={siteConfig.timezone} locale={loc} maxDepth={maxDepth} />

      {totalPages > 1 && (
        <nav aria-label={t(loc, "common.commentPages")} className="mt-6 flex gap-4 text-sm">
          {currentPage > 1 && (
            <a href={`?cpage=${currentPage - 1}#comments`} className="text-zinc-600 dark:text-zinc-400 hover:underline">
              ← {t(loc, "common.previous")}
            </a>
          )}
          <span className="text-zinc-500">{t(loc, "common.page", { page: currentPage, total: totalPages })}</span>
          {currentPage < totalPages && (
            <a href={`?cpage=${currentPage + 1}#comments`} className="text-zinc-600 dark:text-zinc-400 hover:underline">
              {t(loc, "common.next")} →
            </a>
          )}
        </nav>
      )}

      <div id="comment-form" className="mt-8">
        {formClosed ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t(loc, "common.commentsClosedForPost")}
          </p>
        ) : (
          /*
            CommentForm reads ?replyTo= from the URL client-side via useSearchParams().
            This avoids needing to thread searchParams through the 'use cache' page boundary.
          */
          <CommentForm formStartedAt={formStartedAt} postSlug={slug} locale={loc} />
        )}
      </div>
    </section>
  );
}
