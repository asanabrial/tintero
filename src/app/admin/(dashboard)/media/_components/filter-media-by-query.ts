import type { MediaAsset } from "@/lib/media/types";

/**
 * Pure helper — filters media by filename substring, case-insensitively.
 * Empty or whitespace-only q returns the full input array unchanged.
 * No React/Next/node:fs imports; safe to test without a DOM.
 */
export function filterMediaByQuery(items: MediaAsset[], q: string): MediaAsset[] {
  const needle = q.trim().toLowerCase();
  if (needle === "") return items;
  return items.filter((a) => a.filename.toLowerCase().includes(needle));
}
