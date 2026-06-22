// Admin settings page — server component.
// verifySession() is called FIRST inside the inner async component.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import type { SiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { SettingsForm } from "./settings-form";
import { updateSettingsAction } from "./actions";
import { AdminPageHeader } from "../_components/admin-page-header";

interface SettingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function mapConfigToInitial(config: SiteConfig) {
  return {
    title: config.title,
    description: config.description,
    baseUrl: config.baseUrl,
    language: config.language,
    timezone: config.timezone ?? "UTC",
    dateFormat: config.dateFormat ?? "long",
    authorName: config.author.name,
    authorEmail: config.author.email ?? "",
    homepage: config.reading.homepage,
    postsPerPage: config.reading.posts_per_page,
    staticPage: config.reading.static_page ?? "",
    commentsEnabled: config.comments.enabled,
    moderation: config.comments.moderation,
    closeAfterDays: config.comments.close_after_days ?? 0,
    maxDepth: config.comments.max_depth ?? 0,
    perPage: config.comments.per_page ?? 0,
    defaultPostStatus: config.writing?.default_post_status ?? "draft",
    defaultPostCategory: config.writing?.default_post_category ?? "",
    permalinkStructure: config.permalinks?.structure ?? "plain",
  };
}

async function SettingsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await verifySession();
  if (!can(session.role, "settings:manage")) redirect("/admin");

  const { language: loc } = await getLayoutSiteConfig();
  const [config, cats] = await Promise.all([
    getRepository().getSiteConfig(),
    getRepository().listCategories(),
  ]);
  const params = await searchParams;
  const saved = params["saved"] === "1";

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.settings.title")} />
      <SettingsForm
        action={updateSettingsAction}
        initial={mapConfigToInitial(config)}
        saved={saved}
        savedMsg={t(loc, "admin.settings.saved")}
        categories={cats.map((c) => ({ slug: c.slug, label: c.label }))}
      />
    </div>
  );
}

export default function AdminSettingsPage({ searchParams }: SettingsPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SettingsContent searchParams={searchParams} />
    </Suspense>
  );
}
