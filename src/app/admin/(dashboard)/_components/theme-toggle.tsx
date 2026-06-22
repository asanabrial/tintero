"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/provider";

/**
 * Admin color-scheme preference toggle (Light / System / Dark).
 *
 * Reuses the existing `data-color-scheme` mechanism on <html> (see globals.css
 * `@custom-variant dark`): "light"/"dark" force the scheme regardless of OS,
 * while "system" removes the attribute so `dark:` follows prefers-color-scheme.
 *
 * The choice is persisted in localStorage and re-applied before paint by the
 * boot script in the admin layout (so there is no theme flash on reload). The
 * boot script and this storage key are admin-scoped — the public site keeps
 * following the Customizer-forced scheme / OS preference untouched.
 */

export const ADMIN_SCHEME_STORAGE_KEY = "tintero-admin-color-scheme";

type Scheme = "light" | "system" | "dark";

// Same-tab change signal — `storage` only fires across tabs, so we dispatch our
// own event to let useSyncExternalStore re-read after a click in this tab.
const SCHEME_EVENT = "admin-scheme-change";

function applyScheme(scheme: Scheme) {
  const root = document.documentElement;
  try {
    if (scheme === "system") {
      root.removeAttribute("data-color-scheme");
      localStorage.removeItem(ADMIN_SCHEME_STORAGE_KEY);
    } else {
      root.setAttribute("data-color-scheme", scheme);
      localStorage.setItem(ADMIN_SCHEME_STORAGE_KEY, scheme);
    }
  } catch {
    // localStorage unavailable (private mode / disabled) — still apply in-memory.
    if (scheme === "system") root.removeAttribute("data-color-scheme");
    else root.setAttribute("data-color-scheme", scheme);
  }
  window.dispatchEvent(new Event(SCHEME_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(SCHEME_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SCHEME_EVENT, callback);
  };
}

function getSnapshot(): Scheme {
  try {
    const v = localStorage.getItem(ADMIN_SCHEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

// Server render has no localStorage; "system" matches the boot-script default.
function getServerSnapshot(): Scheme {
  return "system";
}

const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className: "h-4 w-4",
};

const OPTIONS: { value: Scheme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg {...svg}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg {...svg}>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg {...svg}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
];

export function ThemeToggle() {
  // The active value lives in localStorage (an external store). The boot script
  // already applied the real scheme before paint; useSyncExternalStore reconciles
  // the highlight on hydration with no setState-in-effect and no theme flash.
  const scheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const tr = useT();

  const choose = (value: Scheme) => {
    applyScheme(value);
  };

  return (
    <div
      role="group"
      aria-label={tr("admin.theme.label")}
      className="flex items-center gap-0.5 rounded-md bg-zinc-800 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = scheme === opt.value;
        const label = tr(`admin.theme.${opt.value}`);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => choose(opt.value)}
            aria-pressed={active}
            title={label}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              active
                ? "bg-[#2271b1] text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {opt.icon}
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
