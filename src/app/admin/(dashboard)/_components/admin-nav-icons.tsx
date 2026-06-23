import type { ReactNode } from "react";

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className: "w-4 h-4 shrink-0",
};

export const NAV_ICONS: Record<string, ReactNode> = {
  "/admin": (
    <svg {...base}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  "/admin/posts": (
    <svg {...base}>
      <path d="M4 5h16M4 10h16M4 15h10" />
    </svg>
  ),
  "/admin/pages": (
    <svg {...base}>
      <path d="M6 2h7l5 5v15H6z" />
      <path d="M13 2v5h5" />
    </svg>
  ),
  "/admin/media": (
    <svg {...base}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  "/admin/categories": (
    <svg {...base}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  "/admin/tags": (
    <svg {...base}>
      <path d="M20.6 13.4 11 3.8H3v8l9.6 9.6z" />
      <circle cx="7" cy="7" r="1.2" />
    </svg>
  ),
  "/admin/graph": (
    <svg {...base}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8 15.8 6.2M8.2 13.2 15.8 17.8" />
    </svg>
  ),
  "/admin/comments": (
    <svg {...base}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-4-1L3 21l1.1-5a8.4 8.4 0 0 1-1-4A8.4 8.4 0 0 1 12 3.5a8.4 8.4 0 0 1 9 8z" />
    </svg>
  ),
  "/admin/menus": (
    <svg {...base}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  "/admin/widgets": (
    <svg {...base}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  "/admin/appearance": (
    <svg {...base}>
      <circle cx="13.5" cy="6.5" r="1" />
      <circle cx="17.5" cy="10.5" r="1" />
      <circle cx="8.5" cy="7.5" r="1" />
      <circle cx="6.5" cy="12.5" r="1" />
      <path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.52-.2-1-.54-1.36a1.98 1.98 0 0 1 1.44-3.36H17a5 5 0 0 0 5-5c0-4.97-4.48-9-10-9z" />
    </svg>
  ),
  "/admin/profile": (
    <svg {...base}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  "/admin/users": (
    <svg {...base}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 4a3 3 0 0 1 0 6" />
      <path d="M18 14a6 6 0 0 1 3 5" />
    </svg>
  ),
  "/admin/settings": (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  "/admin/redirects": (
    <svg {...base}>
      <path d="M15 14l5-4-5-4" />
      <path d="M20 10H9a5 5 0 0 0-5 5v3" />
    </svg>
  ),
  "/admin/tools": (
    <svg {...base}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5l-6 6 2.4 2.4 6-6a4 4 0 0 0 5-5.4l-2.6 2.6-2-2z" />
    </svg>
  ),
};
