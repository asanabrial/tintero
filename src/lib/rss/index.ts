// Pure RSS 2.0 helpers — ZERO imports from Next.js, React, DB, or any non-stdlib module.
// ADR-5: buildRssChannel owns escaping; callers pass RAW text.

/** A single RSS feed item. */
export interface RssItem {
  title: string;
  link: string;
  description: string;
  /** Already-formatted RFC-822 string (pass the result of toRfc822). */
  pubDate: string;
  guid: string;
  /** Optional per-item categories; each emitted as a <category> element (escaped). */
  categories?: string[];
}

/** Channel-level metadata for an RSS 2.0 feed. */
export interface RssChannelMeta {
  title: string;
  link: string;
  description: string;
  /** Optional BCP-47 language tag (e.g. "en-US"). Emitted as <language> when present. */
  language?: string;
  /** Optional self-referential URL. Emitted as <atom:link rel="self"> when present. */
  selfHref?: string;
}

/**
 * Replaces the five XML special characters with their named XML entities.
 * & is replaced FIRST to avoid double-escaping any other entity.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Formats a Date object or ISO-8601 string as an RFC-822 date string
 * suitable for RSS 2.0 <pubDate> elements.
 */
export function toRfc822(date: Date | string): string {
  return new Date(date).toUTCString();
}

/**
 * Builds a complete RSS 2.0 XML document string.
 *
 * ADR-5: This function escapes channel.title, channel.description,
 * item.title, item.description, and item.categories internally.
 * Callers MUST pass RAW (un-escaped) text — do NOT pre-escape or
 * double-escaping will occur.
 *
 * item.link, item.guid, and item.pubDate are emitted raw (URLs / dates).
 */
// ---------------------------------------------------------------------------
// Atom 1.0 types and builders
// Pure helpers — ZERO imports from Next.js, React, DB, or any non-stdlib module.
// ADR-D1: mirrors buildRssChannel template-literal style; reuses escapeXml (ADR-5).
// ---------------------------------------------------------------------------

/** A single Atom 1.0 <entry>. */
export interface AtomEntry {
  /** Stable permalink used for <id> AND <link href>. */
  id: string;
  title: string;
  /** RFC-3339 string (pass result of toAtomDate). */
  updated: string;
  /** Optional plain-text summary (excerpt). Escaped internally. */
  summary?: string;
  /** Optional full HTML body → <content type="html"> CDATA-wrapped + ]]> split. */
  content?: string;
  /** Optional author display name → <author><name>. Name-only (no <email>). */
  author?: string;
  /** Optional category terms; each emitted as <category term="..."/> (escaped). */
  categories?: string[];
}

/** Feed-level metadata for an Atom 1.0 feed. */
export interface AtomFeedMeta {
  /** Feed <id> — typically baseUrl. */
  id: string;
  title: string;
  /** RFC-3339 — newest entry date (or epoch when no entries). */
  updated: string;
  /** Human alternate link (site home). */
  link: string;
  /** Optional self URL → <link rel="self" type="application/atom+xml">. */
  selfHref?: string;
  /** Optional subtitle (site description). Escaped. */
  description?: string;
  /** Optional xml:lang on <feed>. */
  language?: string;
  /** Optional feed-level <author><name>. */
  authorName?: string;
}

/**
 * Formats a date as an RFC-3339 timestamp for Atom <updated>/<published>.
 * - "YYYY-MM-DD" (date-only) → "YYYY-MM-DDT00:00:00Z" (UTC midnight).
 * - Full ISO / Date → normalized via toISOString().
 * - Unparseable → "1970-01-01T00:00:00Z".
 */
export function toAtomDate(date: Date | string): string {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `${date}T00:00:00Z`;
  }
  const d = new Date(date as string);
  if (Number.isNaN(d.getTime())) return "1970-01-01T00:00:00Z";
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Wraps raw HTML in a CDATA section, safely splitting any literal "]]>"
 * sequence so it cannot terminate the CDATA early.
 * Canonical split: "]]>" → "]]]]><![CDATA[>".
 */
export function cdata(html: string): string {
  return `<![CDATA[${html.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

/**
 * Builds a complete Atom 1.0 feed document.
 *
 * ADR-D1 / ADR-5: escapes feed.title, feed.description, feed.authorName,
 * entry.title, entry.summary, entry.author, and category terms internally.
 * Callers pass RAW text. entry.id, entry.updated, and entry.content (CDATA)
 * are NOT entity-escaped.
 */
export function buildAtomFeed(feed: AtomFeedMeta, entries: AtomEntry[]): string {
  const langAttr = feed.language ? ` xml:lang="${feed.language}"` : "";
  const subtitleLine = feed.description
    ? `\n  <subtitle>${escapeXml(feed.description)}</subtitle>`
    : "";
  const selfLink = feed.selfHref
    ? `\n  <link href="${feed.selfHref}" rel="self" type="application/atom+xml" />`
    : "";
  const feedAuthor = feed.authorName
    ? `\n  <author>\n    <name>${escapeXml(feed.authorName)}</name>\n  </author>`
    : "";

  const entriesXml = entries
    .map((e) => {
      const summaryLine = e.summary
        ? `\n    <summary>${escapeXml(e.summary)}</summary>`
        : "";
      const contentLine = e.content
        ? `\n    <content type="html">${cdata(e.content)}</content>`
        : "";
      const authorLine = e.author
        ? `\n    <author>\n      <name>${escapeXml(e.author)}</name>\n    </author>`
        : "";
      const categoriesXml =
        e.categories && e.categories.length > 0
          ? e.categories
              .map((c) => `\n    <category term="${escapeXml(c)}" />`)
              .join("")
          : "";
      return `
  <entry>
    <title>${escapeXml(e.title)}</title>
    <id>${e.id}</id>
    <link href="${e.id}" rel="alternate" />
    <updated>${e.updated}</updated>${summaryLine}${contentLine}${authorLine}${categoriesXml}
  </entry>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"${langAttr}>
  <title>${escapeXml(feed.title)}</title>
  <id>${feed.id}</id>
  <link href="${feed.link}" rel="alternate" />${selfLink}
  <updated>${feed.updated}</updated>${subtitleLine}${feedAuthor}${entriesXml}
</feed>`;
}

// ---------------------------------------------------------------------------
// Original RSS 2.0 builder (unchanged — placed below Atom additions)
// ---------------------------------------------------------------------------

export function buildRssChannel(channel: RssChannelMeta, items: RssItem[]): string {
  const selfLink = channel.selfHref
    ? `\n    <atom:link href="${channel.selfHref}" rel="self" type="application/rss+xml" />`
    : "";

  const languageLine = channel.language
    ? `\n    <language>${channel.language}</language>`
    : "";

  const itemsXml = items
    .map((item) => {
      const categoriesXml =
        item.categories && item.categories.length > 0
          ? item.categories
              .map((c) => `\n      <category>${escapeXml(c)}</category>`)
              .join("")
          : "";

      return `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.link}</link>
      <guid isPermaLink="true">${item.guid}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate}</pubDate>${categoriesXml}
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${channel.link}</link>
    <description>${escapeXml(channel.description)}</description>${languageLine}${selfLink}${itemsXml}
  </channel>
</rss>`;
}
