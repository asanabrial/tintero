// Edit page page — server component.
// verifySession() is called FIRST inside the inner async component.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getPageWriter, getRepository } from "@/lib/content";
import { PageForm } from "../../page-form";
import { updatePageAction } from "../../actions";
import type { PageFormInitial } from "../../page-form";

interface EditPageContentProps {
  params: Promise<{ slug: string }>;
}

async function EditPageContent({ params }: EditPageContentProps) {
  const session = await verifySession();
  if (!can(session.role, "pages:edit")) redirect("/admin");

  const { slug } = await params;

  // getPageWriter().readRawPage bypasses the cached repository to get the raw file
  // (not rendered HTML) — keeps the cached read path intact.
  const raw = await getPageWriter().readRawPage(slug);
  if (!raw) {
    notFound();
  }

  const { frontmatter, body } = raw;

  // Map raw frontmatter to PageFormInitial
  const initial: PageFormInitial = {
    title: typeof frontmatter.title === "string" ? frontmatter.title : "",
    slug: typeof frontmatter.slug === "string" ? frontmatter.slug : slug,
    date:
      frontmatter.date instanceof Date
        ? frontmatter.date.toISOString().slice(0, 10)
        : typeof frontmatter.date === "string"
          ? frontmatter.date
          : "",
    status: typeof frontmatter.status === "string" ? frontmatter.status : "published",
    excerpt: typeof frontmatter.excerpt === "string" ? frontmatter.excerpt : "",
    body: body.trim(),
    parent: typeof frontmatter.parent === "string" ? frontmatter.parent : undefined,
    menuOrder: typeof frontmatter.menu_order === "number" ? frontmatter.menu_order : 0,
    seo:
      frontmatter.seo && typeof frontmatter.seo === "object"
        ? (frontmatter.seo as {
            title?: string;
            metaDescription?: string;
            focusKeyphrase?: string;
            canonical?: string;
            noindex?: boolean;
            ogImage?: string;
            cornerstone?: boolean;
          })
        : undefined,
  };

  // Fetch all pages for the parent select and site config for permalink preview.
  const [{ pages }, config] = await Promise.all([
    getRepository().listPages({ pageSize: Number.MAX_SAFE_INTEGER, includeDrafts: true }),
    getRepository().getSiteConfig(),
  ]);
  const pageList = pages.map((p) => ({ slug: p.slug, title: p.title }));

  return (
    <PageForm
      action={updatePageAction.bind(null, slug)}
      initial={initial}
      currentSlug={slug}
      pages={pageList}
      baseUrl={config.baseUrl}
    />
  );
}

export default function EditPagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <EditPageContent params={params} />
    </Suspense>
  );
}
