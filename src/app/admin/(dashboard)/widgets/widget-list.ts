// widget-list.ts
// Pure, immutable operations over Widget[].
// No React, no Next.js imports.

import type { Widget } from "@/lib/widgets/types";

// ────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ────────────────────────────────────────────────────────────
// defaultsForType
// ────────────────────────────────────────────────────────────

/**
 * Returns sensible defaults for a given widget type.
 */
export function defaultsForType(type: Widget["type"]): Partial<Widget> {
  if (type === "recent-posts") return { count: 5 };
  if (type === "custom-html") return { html: "" };
  return {};
}

// ────────────────────────────────────────────────────────────
// addWidget
// ────────────────────────────────────────────────────────────

/**
 * Append a new widget of `type` with sensible defaults at the end of the list.
 */
export function addWidget(list: Widget[], type: Widget["type"]): Widget[] {
  const widget: Widget = { type, ...defaultsForType(type) };
  return [...list, widget];
}

// ────────────────────────────────────────────────────────────
// removeWidget
// ────────────────────────────────────────────────────────────

/**
 * Remove widget at index i. No-op (returns new array copy) for out-of-bounds.
 */
export function removeWidget(list: Widget[], i: number): Widget[] {
  if (i < 0 || i >= list.length) return [...list];
  return list.filter((_, idx) => idx !== i);
}

// ────────────────────────────────────────────────────────────
// moveWidget
// ────────────────────────────────────────────────────────────

/**
 * Move widget from `from` to `to` (remove-then-insert).
 * Both indices are clamped to [0, list.length-1].
 * Returns same-order new array when from === to.
 */
export function moveWidget(list: Widget[], from: number, to: number): Widget[] {
  if (list.length === 0) return [...list];
  const last = list.length - 1;
  const f = clamp(from, 0, last);
  const t = clamp(to, 0, last);
  if (f === t) return [...list];
  const copy = [...list];
  const [item] = copy.splice(f, 1);
  copy.splice(t, 0, item);
  return copy;
}

// ────────────────────────────────────────────────────────────
// moveWidgetUp / moveWidgetDown
// ────────────────────────────────────────────────────────────

/**
 * Move widget at `i` one step up (swap with i-1).
 * No-op if i === 0. Always returns a new array.
 */
export function moveWidgetUp(list: Widget[], i: number): Widget[] {
  if (i <= 0) return [...list];
  return moveWidget(list, i, i - 1);
}

/**
 * Move widget at `i` one step down (swap with i+1).
 * No-op if item is already last. Always returns a new array.
 */
export function moveWidgetDown(list: Widget[], i: number): Widget[] {
  if (i >= list.length - 1) return [...list];
  return moveWidget(list, i, i + 1);
}

// ────────────────────────────────────────────────────────────
// updateWidget
// ────────────────────────────────────────────────────────────

/**
 * Apply a partial patch to widget at index i.
 * No-op (returns new array copy) for out-of-bounds.
 */
export function updateWidget(
  list: Widget[],
  i: number,
  patch: Partial<Widget>
): Widget[] {
  if (i < 0 || i >= list.length) return [...list];
  return list.map((w, idx) => (idx === i ? { ...w, ...patch } : w));
}
