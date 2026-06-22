// Admin appearance page — server component.
// verifySession() is called FIRST inside the inner async component.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getRepository } from "@/lib/content";
import type { SiteConfig } from "@/lib/content";
import { updateAppearanceAction } from "./actions";
import { CustomizerShell } from "./customizer-shell";

interface AppearancePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function mapConfigToInitial(config: SiteConfig) {
  const t = config.theme ?? {};
  return {
    colorPrimary: t.colorPrimary ?? "",
    colorAccent: t.colorAccent ?? "",
    colorHeaderBg: t.colorHeaderBg ?? "",
    colorHeaderText: t.colorHeaderText ?? "",
    colorText: t.colorText ?? "",
    colorBackground: t.colorBackground ?? "",
    customCss: t.customCss ?? "",
    logo: t.logo ?? "",
    favicon: t.favicon ?? "",
    fontBody: t.fontBody ?? "",
    fontHeading: t.fontHeading ?? "",
    headerImage: t.headerImage ?? "",
    backgroundImage: t.backgroundImage ?? "",
    showTagline: t.showTagline ?? false,
    headerLayout: t.headerLayout ?? "left",
  };
}

async function AppearanceContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await verifySession();
  if (!can(session.role, "appearance:manage")) redirect("/admin");

  const config = await getRepository().getSiteConfig();
  const params = await searchParams;
  const saved = params["saved"] === "1";

  const initial = mapConfigToInitial(config);

  return (
    <CustomizerShell
      action={updateAppearanceAction}
      initial={initial}
      saved={saved}
      siteTitle={config.title}
    />
  );
}

export default function AdminAppearancePage({ searchParams }: AppearancePageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AppearanceContent searchParams={searchParams} />
    </Suspense>
  );
}
