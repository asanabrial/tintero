"use client";

import { useEffect } from "react";
import {
  buildThemeCssVars,
  sanitizeCustomCss,
  themeColorScheme,
  type ThemeFields,
} from "@/lib/content/theme";

/**
 * CustomizePreview — invisible client island for the live-preview iframe.
 *
 * Renders null. Only activates when the URL contains `?customize-preview=1`.
 * Listens for postMessage events from the admin customizer shell and applies
 * theme CSS variables to the document without a full page reload.
 *
 * PPR-safe: no useSearchParams, no usePathname, no cookies(), no server-dynamic
 * APIs. All window.* access is strictly inside useEffect (client-only).
 */
export function CustomizePreview() {
  useEffect(() => {
    // Only activate when explicitly requested — inert for normal visitors.
    if (!window.location.search.includes("customize-preview=1")) return;

    function handler(event: MessageEvent) {
      // Security: reject messages from other origins.
      if (event.origin !== window.location.origin) return;

      const data = event.data as { type?: string; theme?: ThemeFields };
      if (data?.type !== "customize-preview" || !data.theme) return;

      const cssVars = buildThemeCssVars(data.theme);
      const customCss = sanitizeCustomCss(data.theme.customCss);
      const css = cssVars + customCss;

      let styleEl = document.getElementById(
        "customize-live"
      ) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "customize-live";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = css;

      // Mirror the layout's authoritative-scheme behavior live: a chosen page
      // background forces light/dark for the whole preview; clearing it returns
      // the preview to the OS preference.
      const scheme = themeColorScheme(data.theme);
      if (scheme) {
        document.documentElement.setAttribute("data-color-scheme", scheme);
      } else {
        document.documentElement.removeAttribute("data-color-scheme");
      }
    }

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return null;
}
