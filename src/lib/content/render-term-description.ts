import { renderMarkdown } from "./markdown";

/**
 * Render a term description (category or tag) from Markdown to HTML.
 *
 * Returns null when the input is absent or blank so callers can
 * conditionally omit the prose wrapper rather than render an empty div.
 */
export async function renderTermDescription(
  description?: string | null
): Promise<string | null> {
  if (!description || !description.trim()) {
    return null;
  }
  const { html } = await renderMarkdown(description.trim());
  return html;
}
