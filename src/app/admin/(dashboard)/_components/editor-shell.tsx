"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "@/app/components/ui/form";
import { useT } from "@/lib/i18n/provider";

/**
 * Device-preview options — WordPress's editor lets you preview the canvas at
 * Desktop / Tablet / Mobile widths. Icons are module-scope; labels come from the
 * existing admin.appearance.device* keys at render time.
 */
type Device = "desktop" | "tablet" | "mobile";
// maxWidth is a raw CSS length applied via inline style (not a Tailwind class):
// arbitrary max-w-[..] values declared only inside this module array are not
// reliably picked up by the JIT content scanner.
const DEVICES: { key: Device; labelKey: string; maxWidth: string; icon: ReactNode }[] = [
  {
    key: "desktop",
    labelKey: "admin.appearance.deviceDesktop",
    maxWidth: "56rem",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
        <rect x="2" y="4" width="20" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
  {
    key: "tablet",
    labelKey: "admin.appearance.deviceTablet",
    maxWidth: "48rem",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M11 18h2" />
      </svg>
    ),
  },
  {
    key: "mobile",
    labelKey: "admin.appearance.deviceMobile",
    maxWidth: "24rem",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 18h2" />
      </svg>
    ),
  },
];

/**
 * Run a contentEditable command (undo/redo) on the editor surface from the top
 * bar — WordPress puts undo/redo in the top-left. We reach the editor by DOM
 * query (it is a sibling slot, not a child) and refocus it so execCommand acts
 * on it; the resulting input event re-syncs the markdown. No-op in Markdown mode.
 */
function runEditorCommand(command: "undo" | "redo") {
  const el = document.querySelector<HTMLElement>('[role="textbox"][contenteditable="true"]');
  if (!el) return;
  el.focus();
  document.execCommand(command);
}

/**
 * EditorShell — a WordPress (Gutenberg)-style editor chrome.
 *
 * Replaces the old two-column `EditorLayout` for the post/page editors with the
 * modern WordPress feel: a full-bleed distraction-free canvas, a sticky top
 * action bar (Save draft / Preview / Publish), and a collapsible right-hand
 * settings panel. It is purely presentational — it owns only the panel
 * open/close state and renders caller-provided slots, so it makes no assumption
 * about posts vs pages and ships no user-facing strings of its own (every label
 * is passed in already translated).
 *
 * It must render INSIDE the page's single `<form>`: the action buttons and all
 * panel inputs are slots, so they keep contributing to the same FormData.
 *
 * The root uses a negative margin to break out of the dashboard layout's content
 * padding, giving the canvas the edge-to-edge width WordPress uses.
 */
export function EditorShell({
  docLabel,
  statusChip,
  actions,
  options,
  optionsLabel,
  canvas,
  panel,
  panelTitle,
  toggleLabel,
}: {
  /** Center label in the top bar — e.g. the live post title or "Sin título". */
  docLabel: ReactNode;
  /** Small status chip beside the label — e.g. "Borrador" / "Publicada". */
  statusChip?: ReactNode;
  /** Right side of the top bar: Save draft / Publish actions. */
  actions: ReactNode;
  /** Items for the "⋮" options menu (rendered as menu rows). Omit to hide it. */
  options?: ReactNode;
  /** Translated aria-label for the "⋮" options button. */
  optionsLabel?: string;
  /** Main writing surface — title + body. */
  canvas: ReactNode;
  /** Settings panel content (summary rows + collapsible sections). */
  panel: ReactNode;
  /** Translated heading for the settings panel (e.g. "Entrada"). */
  panelTitle: ReactNode;
  /** Translated aria-label/title for the settings toggle button. */
  toggleLabel: string;
}) {
  const tr = useT();
  // `open` = desktop inline column; `mobileOpen` = the slide-in drawer on small
  // screens. The settings panel itself is ALWAYS rendered (just hidden) so its
  // form inputs keep submitting — closing it must never drop categories/tags/etc.
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [device, setDevice] = useState<Device>("desktop");
  const canvasWidth = DEVICES.find((d) => d.key === device)?.maxWidth ?? "56rem";

  // Route the toggle to the right state for the current breakpoint (checked at
  // click time, so there is no SSR/hydration default-state problem).
  const isDesktopView = () =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const togglePanel = () => (isDesktopView() ? setOpen((o) => !o) : setMobileOpen((o) => !o));
  const closePanel = () => (isDesktopView() ? setOpen(false) : setMobileOpen(false));

  return (
    // A self-contained, full-viewport editor (WordPress fullscreen mode) that
    // scrolls INTERNALLY — its own top bar and settings panel stay put while only
    // the canvas scrolls. The negative margins bleed past the dashboard content
    // padding; with the admin chrome hidden (see injected CSS below) they cancel
    // `main`'s padding exactly on all four sides, so `h-screen` fills the viewport
    // edge to edge with no outer scrollbar.
    <div className="-mx-6 -my-6 flex h-screen flex-col overflow-hidden bg-white dark:bg-zinc-900 lg:-mx-8 lg:-my-8">
      {/* WordPress fullscreen: while an editor is mounted, hide ALL admin chrome
          (top bar, left sidebar, mobile nav — every [data-admin-chrome] element)
          plus the dashboard footer, so the editor owns the whole viewport. This
          <style> is scoped to EditorShell, so React unmounts it on navigation
          away and the chrome is fully restored — the effect is reversible. */}
      <style
        dangerouslySetInnerHTML={{
          __html: "main>footer{display:none}[data-admin-chrome]{display:none}",
        }}
      />
      {/* Top action bar — WordPress three-zone layout (brand + tools · title ·
          actions). First flex child, stays fixed above the scrolling canvas. */}
      <header className="flex h-14 shrink-0 items-stretch justify-between border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {/* Left: brand (back to dashboard) + undo / redo. */}
        <div className="flex items-center">
          <Link
            href="/admin"
            aria-label="Tintero"
            className="flex h-14 w-12 shrink-0 items-center justify-center bg-zinc-900 text-base font-bold text-white transition-colors hover:bg-[#2271b1] dark:bg-zinc-950"
          >
            T
          </Link>
          <div className="flex items-center gap-0.5 px-2">
            <button
              type="button"
              onClick={() => runEditorCommand("undo")}
              aria-label="Deshacer"
              title="Deshacer"
              className="flex h-8 w-8 items-center justify-center rounded text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H9" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => runEditorCommand("redo")}
              aria-label="Rehacer"
              title="Rehacer"
              className="flex h-8 w-8 items-center justify-center rounded text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
                <path d="M15 14l5-5-5-5" />
                <path d="M20 9H9a5 5 0 0 0-5 5v0a5 5 0 0 0 5 5h6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Center: document title pill with the document type (WordPress center). */}
        <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
          <div className="flex min-w-0 items-center gap-2 rounded-md px-3 py-1 text-sm">
            <span className="max-w-[22rem] truncate font-medium text-zinc-900 dark:text-zinc-50">
              {docLabel}
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{panelTitle}</span>
            {statusChip ? (
              <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {statusChip}
              </span>
            ) : null}
          </div>
        </div>

        {/* Right: device preview + Save / Publish actions + settings-panel toggle. */}
        <div className="flex shrink-0 items-center gap-2 px-3">
          {/* Device-width preview (WordPress's Desktop / Tablet / Mobile). */}
          <div className="hidden items-center gap-0.5 rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700 xl:flex">
            {DEVICES.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDevice(d.key)}
                aria-pressed={device === d.key}
                aria-label={tr(d.labelKey)}
                title={tr(d.labelKey)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded transition-colors",
                  device === d.key
                    ? "bg-[#2271b1]/10 text-[#2271b1] dark:text-[#4f94d4]"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                )}
              >
                {d.icon}
              </button>
            ))}
          </div>
          {actions}
          <button
            type="button"
            onClick={togglePanel}
            aria-pressed={open || mobileOpen}
            aria-label={toggleLabel}
            title={toggleLabel}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
              open || mobileOpen
                ? "border-[#2271b1] bg-[#2271b1]/10 text-[#2271b1] dark:border-[#4f94d4] dark:text-[#4f94d4]"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="h-5 w-5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>

          {/* Options "⋮" menu — WordPress's top-right overflow. */}
          {options ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOptionsOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={optionsOpen}
                aria-label={optionsLabel ?? "Options"}
                title={optionsLabel ?? "Options"}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
                  <circle cx="12" cy="5" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" />
                </svg>
              </button>
              {optionsOpen ? (
                <>
                  {/* Click-outside backdrop. */}
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setOptionsOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div
                    role="menu"
                    onClick={() => setOptionsOpen(false)}
                    className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    {options}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {/* Body: canvas + settings panel. min-h-0 lets the children own the scroll. */}
      <div className="flex min-h-0 flex-1">
        {/* Seamless white canvas (no card) — the WordPress document surface.
            Wider measure than before; only this column scrolls. */}
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-10 sm:px-10 sm:py-12">
          <div className="mx-auto w-full" style={{ maxWidth: canvasWidth }}>
            {canvas}
          </div>
        </div>
        {/* Mobile drawer backdrop. */}
        {mobileOpen ? (
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          />
        ) : null}
        {/* Settings panel — ALWAYS in the DOM (only hidden), so its form inputs
            keep submitting even when the panel is closed. Desktop: inline column
            toggled by `open`. Mobile: a slide-in drawer toggled by `mobileOpen`. */}
        <aside
          className={cn(
            "shrink-0 overflow-y-auto border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
            // mobile drawer
            "fixed inset-y-0 right-0 z-40 w-80 max-w-[85vw] shadow-xl",
            mobileOpen ? "block" : "hidden",
            // desktop inline column
            "lg:static lg:z-auto lg:max-w-none lg:shadow-none",
            open ? "lg:block lg:w-80" : "lg:hidden"
          )}
        >
          {/* WordPress-style panel header: an active document tab (blue
              underline) + a close control. Flat — the sections below divide
              themselves with hairlines. */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white pr-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="-mb-px flex items-center">
              <span className="border-b-2 border-[#2271b1] px-4 py-2.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {panelTitle}
              </span>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label={toggleLabel}
              className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          <div>{panel}</div>
        </aside>
      </div>
    </div>
  );
}
