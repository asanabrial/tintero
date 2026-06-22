import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getWidgets } from "@/lib/widgets/repository";
import { getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { WidgetEditor } from "./widget-editor";
import { updateWidgetsAction } from "./actions";
import { AdminPageHeader } from "../_components/admin-page-header";

interface WidgetsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function WidgetsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();
  const widgetsConfig = await getWidgets();
  const params = await searchParams;
  const saved = params["saved"] === "1";

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.widgets.title")} />
      <WidgetEditor
        initial={widgetsConfig["blog-sidebar"]}
        saved={saved}
        action={updateWidgetsAction}
      />
    </div>
  );
}

export default function AdminWidgetsPage({ searchParams }: WidgetsPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <WidgetsContent searchParams={searchParams} />
    </Suspense>
  );
}
