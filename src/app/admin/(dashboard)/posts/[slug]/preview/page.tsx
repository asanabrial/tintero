import { notFound } from "next/navigation";
import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getAdapter } from "@/lib/content/repository";
import { Prose } from "@/app/components/prose";
import { previewStatusLabel } from "@/lib/content/preview";

interface Props {
  params: Promise<{ slug: string }>;
}

export default function PostPreviewPage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading preview…</p>}>
      <PostPreviewContent params={params} />
    </Suspense>
  );
}

async function PostPreviewContent({ params }: Props) {
  await verifySession();
  const { slug } = await params;

  const post = await getAdapter().getPost(slug, { includeDrafts: true });
  if (!post) notFound();

  const statusLabel = previewStatusLabel(post.status ?? "published");

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
            {post.title}
          </h1>
          {post.date && (
            <time
              dateTime={post.date}
              className="mt-2 block text-sm text-zinc-500 dark:text-zinc-400"
            >
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}
          {post.author && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              By {post.author}
            </p>
          )}
          {post.categories && post.categories.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {post.categories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
          {post.tags && post.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <Prose html={post.html} />
      </article>
    </div>
  );
}
