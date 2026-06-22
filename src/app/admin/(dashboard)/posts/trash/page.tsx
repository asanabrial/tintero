// Admin posts trash page — server component.
// NO 'use cache' directive — calls verifySession() which reads cookies.
import { Suspense } from "react";
import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { getWriter, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { restorePostAction, permanentlyDeletePostAction } from "../actions";

async function PostsTrashContent() {
  await verifySession();
  const { language: loc } = await getLayoutSiteConfig();

  const trashedPosts = await getWriter().listTrashedPosts();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {t(loc, "admin.trash.title")}
        </h1>
        <Link href="/admin/posts" className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">
          {t(loc, "admin.trash.backToPosts")}
        </Link>
      </div>
      {trashedPosts.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t(loc, "admin.trash.emptyPosts")}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {trashedPosts.map((post) => (
            <li key={post.slug} className="py-3 flex items-center justify-between gap-4">
              <div>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{post.title}</span>
                <span className="ml-2 text-xs text-zinc-400 font-mono">{post.slug}</span>
                <span className="ml-2 text-xs text-zinc-400">{post.date}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <form action={restorePostAction.bind(null, post.slug)}>
                  <button type="submit" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">
                    {t(loc, "admin.trash.restore")}
                  </button>
                </form>
                <form action={permanentlyDeletePostAction.bind(null, post.slug)}>
                  <button type="submit" className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline">
                    {t(loc, "admin.common.deletePermanently")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {trashedPosts.length > 0 && (
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          {t(loc, "admin.trash.note")}
        </p>
      )}
    </div>
  );
}

export default function AdminPostsTrashPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PostsTrashContent />
    </Suspense>
  );
}
