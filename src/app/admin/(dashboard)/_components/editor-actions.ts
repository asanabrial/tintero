"use server";

import { verifySession } from "@/lib/auth/dal";
import { renderMarkdown } from "@/lib/content/markdown";

/**
 * Server action: renders a markdown string to HTML using the site renderer.
 * - verifySession() FIRST (redirects on failure)
 * - Delegates to renderMarkdown (Shiki + GFM + anchors) — server-only
 * - Returns the HTML string (unwrapped from {html})
 */
export async function renderPreviewAction(md: string): Promise<string> {
  await verifySession();
  const { html } = await renderMarkdown(md);
  return html;
}
