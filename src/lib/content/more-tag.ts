const MORE_TAG_PATTERN = /<!--\s*more\s*-->/i;

/**
 * Split a markdown body on the first <!--more--> marker.
 *
 * Returns `{ teaser, hasMore: true }` when the marker is found, where
 * `teaser` is the content before the marker. When no marker is present,
 * returns `{ teaser: body, hasMore: false }`.
 *
 * The match is case-insensitive and whitespace-tolerant inside the comment
 * (e.g. <!-- more -->, <!-- MORE -->, <!--  more  --> all match).
 */
export function splitMore(body: string): { teaser: string; hasMore: boolean } {
  const match = MORE_TAG_PATTERN.exec(body);
  if (!match) {
    return { teaser: body, hasMore: false };
  }
  return { teaser: body.slice(0, match.index), hasMore: true };
}
