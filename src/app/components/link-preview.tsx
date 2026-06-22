"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface LinkPreviewEntry {
  title: string;
  excerpt: string;
}

/** url (e.g. "/blog/foo") → preview card content. */
export type PreviewMap = Record<string, LinkPreviewEntry>;

interface LinkPreviewProps {
  previews: PreviewMap;
  children: React.ReactNode;
}

interface Active {
  entry: LinkPreviewEntry;
  href: string;
  x: number; // viewport coords of the anchor's bottom-left
  y: number;
  above: boolean; // flip above the link when there's no room below
}

const SHOW_DELAY = 260;
const HIDE_DELAY = 140;
const CARD_W = 320;

/**
 * Obsidian-style hover preview. Wraps rendered prose and, when the reader hovers
 * (or keyboard-focuses) an internal link whose target is in `previews`, shows a
 * small card with the target's title and excerpt. Pure client interaction — no
 * network round-trip; the preview map is supplied by the server.
 */
export function LinkPreview({ previews, children }: LinkPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState<Active | null>(null);

  const clearTimers = useCallback(() => {
    if (showTimer.current !== null) clearTimeout(showTimer.current);
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    showTimer.current = null;
    hideTimer.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(null), HIDE_DELAY);
  }, []);

  const previewFor = useCallback(
    (el: EventTarget | null): { anchor: HTMLAnchorElement; entry: LinkPreviewEntry } | null => {
      if (!(el instanceof Element)) return null;
      const anchor = el.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return null;
      const href = anchor.getAttribute("href") ?? "";
      const entry = previews[href];
      return entry ? { anchor, entry } : null;
    },
    [previews]
  );

  const openFor = useCallback(
    (anchor: HTMLAnchorElement, entry: LinkPreviewEntry) => {
      const rect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < 160;
      const x = Math.min(
        Math.max(8, rect.left),
        window.innerWidth - CARD_W - 8
      );
      const y = above ? rect.top : rect.bottom;
      setActive({ entry, href: anchor.getAttribute("href") ?? "", x, y, above });
    },
    []
  );

  // Delegated hover handlers on the prose container.
  const onPointerOver = useCallback(
    (e: React.PointerEvent) => {
      const hit = previewFor(e.target);
      if (!hit) return;
      clearTimers();
      const { anchor, entry } = hit;
      showTimer.current = setTimeout(() => openFor(anchor, entry), SHOW_DELAY);
    },
    [previewFor, clearTimers, openFor]
  );

  const onPointerOut = useCallback(
    (e: React.PointerEvent) => {
      if (!previewFor(e.target)) return;
      if (showTimer.current !== null) {
        clearTimeout(showTimer.current);
        showTimer.current = null;
      }
      scheduleHide();
    },
    [previewFor, scheduleHide]
  );

  // Keyboard parity: open on focus, close on blur.
  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      const hit = previewFor(e.target);
      if (!hit) return;
      clearTimers();
      openFor(hit.anchor, hit.entry);
    },
    [previewFor, clearTimers, openFor]
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  return (
    <div
      ref={containerRef}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onFocusCapture={onFocus}
      onBlurCapture={scheduleHide}
    >
      {children}
      {active ? (
        <div
          role="tooltip"
          className="fixed z-50 w-80 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{
            left: active.x,
            top: active.y,
            transform: active.above ? "translateY(calc(-100% - 8px))" : "translateY(8px)",
          }}
          onPointerEnter={clearTimers}
          onPointerLeave={scheduleHide}
        >
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {active.entry.title}
          </p>
          {active.entry.excerpt ? (
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {active.entry.excerpt}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
