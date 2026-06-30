"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TurndownService from "turndown";
import { gfm } from "@joplin/turndown-plugin-gfm";
import { MediaPickerModal, type CalamoAsset } from "calamo";
import { cn } from "@/app/components/ui/form";

/**
 * RichEditor — a WordPress-style Visual/Markdown editor.
 *
 * "Visual" mode is a prose-styled `contentEditable` surface: the content is
 * rendered (real headings, bold, lists, code) with NO visible markdown syntax —
 * this is what closes the gap with WordPress's editor. "Markdown" mode is the
 * raw source, a lossless fallback for tables / wikilinks / anything the visual
 * round-trip would simplify (WordPress has the same Visual⇄Code split).
 *
 * The single source of truth submitted with the form is always **markdown**,
 * carried by a hidden <input name={name}>. In Visual mode we serialize the
 * contentEditable HTML back to markdown (turndown + GFM) on every edit; in
 * Markdown mode the textarea is the markdown directly. Markdown → HTML for the
 * visual surface is done by the `renderHtml` server action (a clean,
 * round-trippable pipeline — no Shiki/anchor/wikilink markup).
 */

// Stateless converter — safe at module scope. Mirrors src/lib/content/wxr.ts.
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});
turndown.use(gfm);

type Mode = "visual" | "markdown";

// Toolbar definition lives at module scope (pure data) so render never builds
// closures that touch the editor ref — the ref is read only in the click handler.
type Tool =
  | { label: string; title: string; kind: "cmd"; command: string; value?: string }
  | { label: string; title: string; kind: "link" }
  | { label: string; title: string; kind: "code" }
  | { label: string; title: string; kind: "media" };

const TOOLS: Tool[] = [
  { label: "B", title: "Bold", kind: "cmd", command: "bold" },
  { label: "I", title: "Italic", kind: "cmd", command: "italic" },
  { label: "H2", title: "Heading 2", kind: "cmd", command: "formatBlock", value: "H2" },
  { label: "H3", title: "Heading 3", kind: "cmd", command: "formatBlock", value: "H3" },
  { label: "¶", title: "Paragraph", kind: "cmd", command: "formatBlock", value: "P" },
  { label: "“", title: "Quote", kind: "cmd", command: "formatBlock", value: "BLOCKQUOTE" },
  { label: "•", title: "Bulleted list", kind: "cmd", command: "insertUnorderedList" },
  { label: "1.", title: "Numbered list", kind: "cmd", command: "insertOrderedList" },
  { label: "Link", title: "Link", kind: "link" },
  { label: "Img", title: "Image", kind: "media" },
  { label: "`", title: "Inline code", kind: "code" },
];

interface RichEditorProps {
  /** Hidden field name carrying the markdown (e.g. "body"). */
  name: string;
  /** Initial markdown to edit. */
  initialMarkdown?: string;
  /** Server action: markdown → clean (round-trippable) HTML for the visual surface. */
  renderHtml: (md: string) => Promise<string>;
  /** Optional id for the visual surface. */
  id?: string;
  /** Accessible name — the visual surface is a contentEditable div, not a
   *  labelable form element, so it carries an aria-label rather than a <label for>. */
  ariaLabel?: string;
  /** Media-library lister — enables the toolbar "Img" button (insert from library). */
  listMedia?: () => Promise<CalamoAsset[]>;
  /** Placeholder shown over the empty visual surface (WordPress's empty-canvas hint). */
  placeholder?: string;
  /**
   * Called with the latest markdown on every edit. Lets a parent mirror the body
   * into React state — the hidden <input> alone is invisible to consumers like
   * the SEO box, because programmatic value changes fire no input event.
   */
  onMarkdownChange?: (md: string) => void;
}

export function RichEditor({ name, initialMarkdown = "", renderHtml, id, ariaLabel, listMedia, placeholder, onMarkdownChange }: RichEditorProps) {
  const [mode, setMode] = useState<Mode>("visual");
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [mediaOpen, setMediaOpen] = useState(false);
  // Latest markdown for effects that must not re-run on every keystroke.
  const markdownRef = useRef(initialMarkdown);
  const editorRef = useRef<HTMLDivElement | null>(null);
  // Caret position saved when the media picker opens (the modal steals focus),
  // restored before inserting so the image lands where the cursor was.
  const savedRange = useRef<Range | null>(null);

  const setMd = useCallback((md: string) => {
    markdownRef.current = md;
    setMarkdown(md);
    onMarkdownChange?.(md);
  }, [onMarkdownChange]);

  // Serialize the visual surface back to markdown after any edit/command.
  const syncFromVisual = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setMd(turndown.turndown(el.innerHTML).trim());
  }, [setMd]);

  // Render markdown → HTML into the visual surface whenever we enter visual mode
  // (and on mount). Reads markdownRef so typing does not re-render and reset the
  // caret. An empty doc gets a single empty paragraph so the caret has a home.
  useEffect(() => {
    if (mode !== "visual") return;
    let cancelled = false;
    renderHtml(markdownRef.current).then((html) => {
      if (cancelled || !editorRef.current) return;
      editorRef.current.innerHTML = html && html.trim() ? html : "<p><br></p>";
    });
    return () => {
      cancelled = true;
    };
  }, [mode, renderHtml]);

  // Apply a contentEditable command, keeping focus/selection, then re-serialize.
  const exec = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, value);
      syncFromVisual();
    },
    [syncFromVisual]
  );

  const runTool = useCallback(
    (t: Tool) => {
      if (t.kind === "cmd") {
        exec(t.command, t.value);
      } else if (t.kind === "link") {
        const url = window.prompt("URL");
        if (url) exec("createLink", url);
      } else if (t.kind === "media") {
        // Save the caret (the modal steals focus) and open the library picker.
        const sel = window.getSelection?.();
        savedRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        setMediaOpen(true);
      } else {
        const sel = window.getSelection?.()?.toString() ?? "";
        exec("insertHTML", `<code>${sel || "code"}</code>`);
      }
    },
    [exec]
  );

  // Insert the picked image at the saved caret, then re-serialize (turndown
  // converts <img> → ![alt](url), so it round-trips to markdown cleanly).
  const insertImage = useCallback(
    (asset: CalamoAsset) => {
      const el = editorRef.current;
      if (el) {
        el.focus();
        const sel = window.getSelection();
        if (savedRange.current && sel) {
          sel.removeAllRanges();
          sel.addRange(savedRange.current);
        }
        const alt = (asset.alt ?? "").replace(/"/g, "&quot;");
        document.execCommand("insertHTML", false, `<img src="${asset.url}" alt="${alt}">`);
        syncFromVisual();
      }
      setMediaOpen(false);
    },
    [syncFromVisual]
  );

  const tabClass = (active: boolean) =>
    cn(
      "rounded-t px-3 py-1.5 text-xs font-medium transition-colors",
      active
        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
        : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
    );

  return (
    <div>
      {/* Hidden field — always carries the markdown source of truth. */}
      <input type="hidden" name={name} value={markdown} />

      {/* Mode tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-100 pb-1 dark:border-zinc-800">
        <button type="button" className={tabClass(mode === "visual")} onClick={() => setMode("visual")}>
          Visual
        </button>
        <button type="button" className={tabClass(mode === "markdown")} onClick={() => setMode("markdown")}>
          Markdown
        </button>
      </div>

      {mode === "visual" ? (
        <>
          {/* Formatting bar — buttons use onMouseDown+preventDefault so the
              selection in the editor is preserved when the command runs. */}
          <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-100 py-1 dark:border-zinc-800">
            {TOOLS.filter((t) => t.kind !== "media" || !!listMedia).map((t) => (
              <button
                key={t.title}
                type="button"
                title={t.title}
                aria-label={t.title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  runTool(t);
                }}
                className="rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative">
            {placeholder && !markdown.trim() ? (
              <p className="pointer-events-none absolute left-0 top-4 text-[1.05rem] text-zinc-400 dark:text-zinc-600">
                {placeholder}
              </p>
            ) : null}
            <div
              id={id}
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={ariaLabel}
              onInput={syncFromVisual}
              onBlur={syncFromVisual}
              className="prose prose-zinc max-w-none min-h-[58vh] py-4 focus:outline-none dark:prose-invert"
            />
          </div>
        </>
      ) : (
        <textarea
          value={markdown}
          onChange={(e) => setMd(e.target.value)}
          aria-label={ariaLabel}
          spellCheck={false}
          className="min-h-[58vh] w-full resize-y bg-transparent py-4 font-mono text-sm leading-6 text-zinc-900 focus:outline-none dark:text-zinc-100"
        />
      )}

      {listMedia ? (
        <MediaPickerModal
          open={mediaOpen}
          listMedia={listMedia}
          onClose={() => setMediaOpen(false)}
          onSelect={insertImage}
        />
      ) : null}
    </div>
  );
}
