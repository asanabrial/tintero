"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";

interface CopyUrlButtonProps {
  url: string;
}

export function CopyUrlButton({ url }: CopyUrlButtonProps) {
  const tr = useT();
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        copied
          ? "inline-flex items-center rounded-md border border-green-300 dark:border-green-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400 focus:outline-none focus:ring-2 focus:ring-zinc-500 transition-colors"
          : "inline-flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      }
    >
      {copied ? tr("admin.media.copied") : tr("admin.media.copyUrl")}
    </button>
  );
}
