import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeShiki from "@shikijs/rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { Plugin } from "unified";
import type { Root, Text, ElementContent } from "hast";
import { visit, SKIP } from "unist-util-visit";
import { VFile } from "vfile";
import type { WikiResolver } from "./links";

// Explicit language allowlist to control bundle size.
const HIGHLIGHT_LANGS = [
  "typescript",
  "javascript",
  "bash",
  "json",
  "html",
  "css",
  "python",
] as const;

// [[target]], [[target|alias]], [[target#heading]], and ![[embed]].
const WIKILINK_RE = /(!?)\[\[([^\]]+)\]\]/g;

function parseWikiInner(inner: string): { target: string; alias?: string } {
  const pipe = inner.indexOf("|");
  const left = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
  const alias = pipe === -1 ? undefined : inner.slice(pipe + 1).trim() || undefined;
  const target = left.split("#")[0].trim();
  return { target, alias };
}

/**
 * Rehype plugin that turns wikilinks into real links.
 *
 * Resolution comes from a WikiResolver passed per render via `file.data.wikiResolver`:
 * - resolved → <a class="wikilink" href="/blog|pages/slug">display</a>
 * - unresolved → <span class="wikilink wikilink-broken">display</span> (Obsidian-style)
 * - embeds ![[…]] → plain text (transclusion is out of scope)
 *
 * With NO resolver (file.data.wikiResolver absent) it degrades to the previous
 * behavior: wikilinks render as plain text, so callers that don't supply a
 * corpus map (and existing tests) are unaffected.
 */
const rehypeWikilinks: Plugin<[], Root> = () => {
  return (tree, file) => {
    const resolver =
      (file.data as { wikiResolver?: WikiResolver }).wikiResolver ?? null;

    visit(tree, "text", (node: Text, index, parent) => {
      if (index === undefined || parent === undefined) return;
      const value = node.value;
      if (!value.includes("[[")) return;

      WIKILINK_RE.lastIndex = 0;
      const out: ElementContent[] = [];
      let last = 0;
      let changed = false;
      let m: RegExpExecArray | null;
      while ((m = WIKILINK_RE.exec(value)) !== null) {
        const [full, bang, inner] = m;
        const { target, alias } = parseWikiInner(inner);
        if (target === "") continue; // leave malformed [[]] as literal text
        changed = true;
        if (m.index > last) {
          out.push({ type: "text", value: value.slice(last, m.index) });
        }
        last = m.index + full.length;
        const display = alias ?? target;

        // Embeds and the no-resolver fallback render as plain text.
        if (bang === "!" || resolver === null) {
          out.push({ type: "text", value: display });
          continue;
        }
        const resolved = resolver(target);
        out.push(
          resolved
            ? {
                type: "element",
                tagName: "a",
                properties: { href: resolved.url, className: ["wikilink"] },
                children: [{ type: "text", value: display }],
              }
            : {
                type: "element",
                tagName: "span",
                properties: {
                  className: ["wikilink", "wikilink-broken"],
                  title: "Unresolved link",
                },
                children: [{ type: "text", value: display }],
              }
        );
      }
      if (!changed) return;
      if (last < value.length) {
        out.push({ type: "text", value: value.slice(last) });
      }
      parent.children.splice(index, 1, ...out);
      return [SKIP, index + out.length];
    });
  };
};

function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, { behavior: "append" })
    .use(rehypeShiki, {
      theme: "github-dark",
      langs: [...HIGHLIGHT_LANGS],
    })
    .use(rehypeWikilinks)
    .use(rehypeStringify);
}

type MarkdownProcessor = ReturnType<typeof buildProcessor>;

let _processor: MarkdownProcessor | null = null;

function getProcessor(): MarkdownProcessor {
  if (!_processor) {
    _processor = buildProcessor();
  }
  return _processor;
}

export interface RenderResult {
  html: string;
}

export interface RenderOptions {
  /**
   * Optional corpus resolver. When supplied, wikilinks ([[target]]) render as
   * real <a> links (or broken spans); when omitted they render as plain text.
   */
  wikiResolver?: WikiResolver;
}

/**
 * Render a markdown string to HTML using the unified pipeline.
 * GFM, heading slugs/anchors, syntax highlighting, and wikilink resolution included.
 * The wikiResolver (if any) is passed to the pipeline via the VFile data channel,
 * which keeps the processor a reusable singleton.
 */
export async function renderMarkdown(
  md: string,
  options?: RenderOptions
): Promise<RenderResult> {
  const file = new VFile({ value: md });
  (file.data as { wikiResolver?: WikiResolver }).wikiResolver =
    options?.wikiResolver;
  const out = await getProcessor().process(file);
  return { html: String(out) };
}
