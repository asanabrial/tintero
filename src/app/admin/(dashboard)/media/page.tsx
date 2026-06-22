// Admin media library page — server component.
// The dynamic content (which reads cookies via verifySession) is wrapped in
// <Suspense> as required by Next.js 16 cacheComponents mode.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { listUploads } from "@/lib/media/fs-media";
import { getMediaMeta } from "@/lib/media/media-meta";
import { UPLOADS_DIR } from "@/lib/media/dir";
import { UploadForm } from "./UploadForm";
import { MediaCard } from "./MediaCard";
import { AdminPageHeader } from "../_components/admin-page-header";
import { MediaGridSelectable } from "./_components/media-grid-selectable";
import { bulkDeleteMediaAction } from "./actions";
import { filterMediaByQuery } from "./_components/filter-media-by-query";
import { MediaSearchForm } from "./_components/media-search-form";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";

async function MediaLibraryContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await verifySession();
  const canDelete = can(session.role, "media:delete");
  const { language: loc } = await getLayoutSiteConfig();

  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const assets = await listUploads(UPLOADS_DIR);
  const cards = await Promise.all(
    assets.map(async (asset) => ({
      asset,
      meta: await getMediaMeta(UPLOADS_DIR, asset.filename),
    }))
  );

  const keep = new Set(
    filterMediaByQuery(
      cards.map((c) => c.asset),
      q
    ).map((a) => a.filename)
  );
  const filteredCards = q === "" ? cards : cards.filter((c) => keep.has(c.asset.filename));

  const mediaCards = filteredCards.map(({ asset, meta }) => (
    <MediaCard key={asset.filename} asset={asset} meta={meta} />
  ));

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.media.title")} />
      <UploadForm />
      {(filteredCards.length > 0 || q !== "") && <MediaSearchForm q={q} />}
      {q !== "" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          {t(loc, "admin.posts.searchResultsFor", { q, count: filteredCards.length })}{" "}
          <Link href="/admin/media" className="underline">
            {t(loc, "admin.media.clearSearch")}
          </Link>
        </p>
      )}
      {filteredCards.length === 0 ? (
        q !== "" ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-6">
            {t(loc, "admin.media.noResults", { q })}
          </p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-6">{t(loc, "admin.media.empty")}</p>
        )
      ) : (
        <div className="mt-6">
          {canDelete ? (
            <MediaGridSelectable
              items={filteredCards.map(({ asset }) => ({ filename: asset.filename }))}
              bulkDeleteAction={bulkDeleteMediaAction}
            >
              {mediaCards}
            </MediaGridSelectable>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {mediaCards}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <MediaLibraryContent searchParams={searchParams} />
    </Suspense>
  );
}
