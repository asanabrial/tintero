import { Suspense } from "react";
import { AdminTopBarUserSlot } from "./admin-top-bar-user-slot";
import { AdminTopBarNewDropdown } from "./admin-top-bar-new-dropdown";
import { ThemeToggle } from "./theme-toggle";

export function AdminTopBar({ locale }: { locale: string }) {
  return (
    <header className="flex h-10 w-full items-center justify-between gap-4 bg-zinc-900 px-4 text-sm text-zinc-100">
      <div className="flex items-center gap-4">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-zinc-100 hover:text-white transition-colors"
        >
          Tintero
        </a>
        <span className="text-zinc-600" aria-hidden="true">
          |
        </span>
        <Suspense fallback={<span className="text-xs text-zinc-500">…</span>}>
          <AdminTopBarNewDropdown />
        </Suspense>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <Suspense fallback={<span className="text-xs text-zinc-500">…</span>}>
          <AdminTopBarUserSlot locale={locale} />
        </Suspense>
      </div>
    </header>
  );
}
