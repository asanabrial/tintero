"use server";

import { verifySession } from "@/lib/auth/dal";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

/**
 * Clean markdown → HTML for the WYSIWYG ("Visual") editor surface.
 *
 * Deliberately plainer than the site renderer (`renderMarkdown`): NO Shiki token
 * spans, heading anchors, or wikilink rewriting. Those produce deeply nested
 * markup that does not round-trip back to markdown — and the Visual editor's
 * HTML is converted back to markdown (via turndown) on every edit. Keeping the
 * HTML semantic (h2/p/strong/ul/pre>code/table…) makes that round-trip lossless
 * for the common constructs. Anything exotic is best edited in Markdown mode.
 */
const editorProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify);

export async function renderEditorHtmlAction(md: string): Promise<string> {
  await verifySession();
  const file = await editorProcessor.process(md);
  return String(file);
}
