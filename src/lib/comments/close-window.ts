// Pure helper: decide whether the comment FORM is closed for a post based on
// the "close comments after N days" discussion setting. Existing comments stay
// visible regardless — this only governs whether NEW submissions are accepted.

/**
 * Returns true when the comment form should be closed for a post.
 *
 * @param postDate       The post date (YYYY-MM-DD or any Date-parseable string).
 * @param closeAfterDays Days after the post date to close the form; 0 = never.
 * @param now            Current instant as an ISO string (request-time "now").
 *
 * Closed when closeAfterDays > 0 AND (now - postDate) strictly exceeds the window.
 * Invalid/zero inputs fail open (comments remain available).
 */
export function areCommentsClosed(
  postDate: string,
  closeAfterDays: number,
  now: string
): boolean {
  if (!Number.isFinite(closeAfterDays) || closeAfterDays <= 0) return false;

  const postMs = Date.parse(postDate);
  const nowMs = Date.parse(now);
  if (Number.isNaN(postMs) || Number.isNaN(nowMs)) return false;

  const ageDays = (nowMs - postMs) / (1000 * 60 * 60 * 24);
  return ageDays > closeAfterDays;
}
