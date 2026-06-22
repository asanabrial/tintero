"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * WordPress "Screen Options" column-visibility state, shared by the admin list
 * tables (posts, users, …). The hidden columns are persisted in localStorage as
 * a comma-joined list of HIDDEN keys (empty = all shown).
 *
 * Uses useSyncExternalStore so the active value comes from localStorage with NO
 * hydration mismatch: getServerSnapshot returns "" (all columns shown), which
 * matches the no-storage default, and the client reconciles after hydration.
 * getSnapshot returns the raw string (stable by value) — callers parse it to a
 * Set via the returned helpers.
 */
export function useColumnVisibility(storageKey: string) {
  // Per-store change event so same-tab toggles re-read (storage only fires cross-tab).
  const eventName = `column-visibility:${storageKey}`;

  const hiddenRaw = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      window.addEventListener(eventName, callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener(eventName, callback);
      };
    },
    () => {
      try {
        return localStorage.getItem(storageKey) ?? "";
      } catch {
        return "";
      }
    },
    () => ""
  );

  const hidden = useMemo(
    () => new Set(hiddenRaw ? hiddenRaw.split(",") : []),
    [hiddenRaw]
  );

  const isVisible = (key: string) => !hidden.has(key);

  const toggleColumn = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    try {
      const raw = [...next].join(",");
      if (raw) localStorage.setItem(storageKey, raw);
      else localStorage.removeItem(storageKey);
    } catch {
      /* localStorage unavailable — in-memory state still drives this render */
    }
    window.dispatchEvent(new Event(eventName));
  };

  return { isVisible, toggleColumn };
}
