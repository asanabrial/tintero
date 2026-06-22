// Admin menus page — server component.
// verifySession() is called FIRST inside the inner async component.
// NO 'use cache' directive — this route must render dynamically.
// NO export const dynamic — verifySession() calls cookies() which forces dynamic rendering.

import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getRepository, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { buildCategoryHref } from "./menu-item-picker";
import { MenuEditor } from "./menu-editor";
import { updateNavAction, updateFooterNavAction } from "./actions";
import { AdminPageHeader } from "../_components/admin-page-header";

interface MenusPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function MenusContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const repo = getRepository();
  const [config, pagesResult, categories] = await Promise.all([
    repo.getSiteConfig(),
    repo.listPages({ pageSize: Number.MAX_SAFE_INTEGER }),
    repo.listCategories(),
  ]);

  const params = await searchParams;
  const saved = params["saved"] === "1";

  const pickerPages = pagesResult.pages
    .filter((p) => p.status === "published")
    .map((p) => ({ label: p.title, href: `/pages/${p.slug}` }));

  const pickerCategories = categories.map((c) => ({
    label: c.label,
    href: buildCategoryHref(c.slug),
  }));

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.menus.title")} />
      <section>
        <h2 className="text-lg font-semibold mb-4">{t(loc, "admin.menus.mainMenu")}</h2>
        <MenuEditor
          initial={config.nav}
          saved={saved}
          action={updateNavAction}
          pickerPages={pickerPages}
          pickerCategories={pickerCategories}
        />
      </section>
      <section className="mt-12">
        <h2 className="text-lg font-semibold mb-4">{t(loc, "admin.menus.footerMenu")}</h2>
        <MenuEditor
          initial={config.footerNav}
          saved={saved}
          action={updateFooterNavAction}
          pickerPages={pickerPages}
          pickerCategories={pickerCategories}
        />
      </section>
    </div>
  );
}

export default function AdminMenusPage({ searchParams }: MenusPageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <MenusContent searchParams={searchParams} />
    </Suspense>
  );
}
