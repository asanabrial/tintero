import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { publicGraph, toGraphView } from "@/lib/content/links";
import { GraphView } from "@/app/components/graph-view";
import { GraphLegend } from "@/app/components/graph-legend";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getLayoutSiteConfig();
  return {
    title: t(config.language, "common.graphTitle"),
    description: t(config.language, "common.graphDescription"),
  };
}

async function GraphContent({ locale }: { locale?: string }) {
  const loc = locale ?? "en";
  await connection();
  // Public subgraph only — drafts, private and password content are excluded.
  const view = toGraphView(publicGraph(await getRepository().getLinkGraph()));
  return (
    <>
      <GraphLegend locale={loc} />
      <div className="mt-4">
        <GraphView nodes={view.nodes} links={view.links} locale={loc} />
      </div>
    </>
  );
}

export default async function PublicGraphPage() {
  const config = await getLayoutSiteConfig();
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        {t(config.language, "common.graphTitle")}
      </h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
        {t(config.language, "common.graphSubheading")}
      </p>
      <Suspense
        fallback={
          <div className="h-[70vh] w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        }
      >
        <GraphContent locale={config.language} />
      </Suspense>
    </div>
  );
}
