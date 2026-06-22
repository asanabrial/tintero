import { notFound } from "next/navigation";
import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getAdapter } from "@/lib/content/repository";
import { Prose } from "@/app/components/prose";
import { previewStatusLabel } from "@/lib/content/preview";

interface Props {
  params: Promise<{ slug: string }>;
}

export default function PagePreviewPage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading preview…</p>}>
      <PagePreviewContent params={params} />
    </Suspense>
  );
}

async function PagePreviewContent({ params }: Props) {
  await verifySession();
  const { slug } = await params;

  const page = await getAdapter().getPage(slug, { includeDrafts: true });
  if (!page) notFound();

  const statusLabel = previewStatusLabel(page.status ?? "published");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Preview banner */}
      <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        <span className="font-semibold">Preview — not published.</span>{" "}
        Status: <span className="font-medium">{statusLabel}</span>
      </div>

      <article>
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {page.title}
          </h1>
          {page.date && (
            <time
              dateTime={page.date}
              className="mt-2 block text-sm text-zinc-500 dark:text-zinc-400"
            >
              {new Date(page.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}
        </header>

        <Prose html={page.html} />
      </article>
    </div>
  );
}
