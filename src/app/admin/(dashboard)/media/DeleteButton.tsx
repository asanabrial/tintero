"use client";

import { useT } from "@/lib/i18n/provider";

interface DeleteButtonProps {
  action: () => Promise<void>;
  filename: string;
}

/**
 * Client island for the delete confirmation gesture.
 * Shows a native confirm dialog before invoking the server action.
 */
export function DeleteButton({ action, filename }: DeleteButtonProps) {
  const tr = useT();

  async function handleDelete() {
    if (!window.confirm(tr("admin.media.confirmDelete", { filename }))) return;
    await action();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {tr("admin.common.delete")}
    </button>
  );
}
