// MediaCard — presentational server component.
// Renders a single media asset card: thumbnail, filename, size, copy URL, delete, alt/caption edit.
// Container/presentational split: page is the container (data + auth); MediaCard is pure props.

import { CopyUrlButton } from "./CopyUrlButton";
import { DeleteButton } from "./DeleteButton";
import { EditMetaForm } from "./EditMetaForm";
import type { MediaAsset } from "@/lib/media/types";
import type { MediaMeta } from "@/lib/media/media-meta";
import { deleteMediaAction } from "./actions";

interface MediaCardProps {
  asset: MediaAsset;
  meta: MediaMeta;
}

/**
 * Converts a byte count to a human-readable string (e.g. 1.2 MB, 450 KB).
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaCard({ asset, meta }: MediaCardProps) {
  const boundDelete = deleteMediaAction.bind(null, asset.filename);

  return (
    <article className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col gap-3">
      {/* Plain img — not next/image (v1 intentional, ADR-M6) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset.url}
        alt={meta.alt ?? asset.filename}
        width={200}
        height={200}
        className="rounded-md object-cover w-full aspect-square"
      />
      <p className="text-sm text-zinc-900 dark:text-zinc-50 truncate">{asset.filename}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatBytes(asset.size)}</p>
      <EditMetaForm filename={asset.filename} initialAlt={meta.alt} initialCaption={meta.caption} />
      <div className="flex gap-2">
        <CopyUrlButton url={asset.url} />
        <DeleteButton action={boundDelete} filename={asset.filename} />
      </div>
    </article>
  );
}
