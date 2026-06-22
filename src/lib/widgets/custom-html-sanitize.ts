/**
 * Sanitizes custom-html widget content.
 * Security-critical: strips script/style/iframe, on* event attributes,
 * and javascript: URLs. Keeps basic safe tags.
 *
 * This is a SIMPLE regex-based sanitizer intentionally scoped to the
 * known-safe subset of HTML for widget use.
 */
export function sanitizeWidgetHtml(html: string): string {
  let result = html;

  // 1. Remove script, style, iframe blocks (including content)
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  result = result.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
  // Self-closing variants
  result = result.replace(/<script\b[^>]*\/>/gi, "");
  result = result.replace(/<iframe\b[^>]*\/>/gi, "");

  // 2. Strip on* event attributes (e.g. onclick, onerror, onload)
  result = result.replace(
    /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    ""
  );

  // 3. Strip javascript: URLs from href/src/action attributes
  result = result.replace(
    /(\s+(?:href|src|action)\s*=\s*)(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi,
    ""
  );

  return result;
}
