// Admin Graph page — server component.
// verifySession() runs FIRST inside the inner async component (no 'use cache').
// Uses the FULL link graph (includes drafts / private / password content).

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { toGraphView } from "@/lib/content/links";
import { GraphView } from "@/app/components/graph-view";
import { GraphLegend } from "@/app/components/graph-legend";
import { AdminPageHeader } from "../_components/admin-page-header";

async function GraphContent() {
  // AUTH GUARD — must be first
  const session = await verifySession();
  if (!can(session.role, "posts:create")) redirect("/admin");

  const { language: loc } = await getLayoutSiteConfig();
  const view = toGraphView(await getRepository().getLinkGraph());

  return (
    <div className="space-y-5">
      <AdminPageHeader title={t(loc, "admin.graph.title")} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t(loc, "admin.graph.description")}
      </p>
      <GraphLegend />
      <GraphView nodes={view.nodes} links={view.links} />
    </div>
  );
}

export default function AdminGraphPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading graph…</p>}>
      <GraphContent />
    </Suspense>
  );
}
