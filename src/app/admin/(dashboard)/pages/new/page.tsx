// New page page — server component.
// verifySession() is called FIRST inside the inner async component.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getRepository } from "@/lib/content";
import { PageForm } from "../page-form";
import { createPageAction } from "../actions";

async function NewPageContent() {
  const session = await verifySession();
  if (!can(session.role, "pages:create")) redirect("/admin");

  // Compute today's date AT REQUEST TIME — NOT at module scope.
  // Per spec: default date is the request-time date; must not be hoisted/cached.
  // (server-no-shared-module-state: request-time date must live inside the async fn)
  const defaultDate = new Date().toISOString().slice(0, 10);

  // Fetch all pages for the parent select and site config for permalink preview.
  const [{ pages }, config] = await Promise.all([
    getRepository().listPages({ pageSize: Number.MAX_SAFE_INTEGER, includeDrafts: true }),
    getRepository().getSiteConfig(),
  ]);
  const pageList = pages.map((p) => ({ slug: p.slug, title: p.title }));

  return (
    <PageForm
      action={createPageAction}
      initial={{ date: defaultDate }}
      pages={pageList}
      baseUrl={config.baseUrl}
    />
  );
}

export default function NewPagePage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <NewPageContent />
    </Suspense>
  );
}
