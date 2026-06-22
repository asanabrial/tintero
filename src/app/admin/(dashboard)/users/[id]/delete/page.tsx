// Delete user confirmation page — server component.
// NO 'use cache' — calls verifySession() which reads cookies (forces dynamic rendering).
// verifySession() is called FIRST inside the content component (spec: Auth Gate).
//
// UX defense-in-depth: guard messages are rendered BEFORE the delete button
// when deletion is structurally disallowed. The deleteUserFormAction still enforces
// both guards server-side — the UI is an aid, not the enforcement mechanism.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getUserRepository } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";
import { deleteUserFormAction } from "../../actions";

interface DeleteUserContentProps {
  params: Promise<{ id: string }>;
}

async function DeleteUserContent({ params }: DeleteUserContentProps) {
  // Auth gate — must be first; redirects to /admin/login on failure
  const session = await verifySession();
  if (!can(session.role, "users:manage")) redirect("/admin");

  const { id } = await params;
  const { language: loc } = await getLayoutSiteConfig();

  // Graceful not-found: render a message instead of crashing or redirecting
  const user = await getUserRepository().findById(id);
  if (!user) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.users.userNotFound")}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.users.userNotFoundDesc")}</p>
        <a href="/admin/users" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.users.backToUsers")}</a>
      </div>
    );
  }

  // ─── UX guard evaluation (defense-in-depth; action still enforces server-side) ───

  // Self-delete guard: same check as deleteUserFormAction (sync, no DB)
  if (id === session.userId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.users.deleteUserHeading")}</h1>
        <p className="text-sm text-zinc-900 dark:text-zinc-50">
          <strong>{user.email}</strong>
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.users.cannotDeleteSelf")}</p>
        <a href="/admin/users" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.users.backToUsers")}</a>
      </div>
    );
  }

  // Last-admin guard: show blocking message if this is the only remaining admin
  const adminCount = await getUserRepository().countAdmins();
  if (adminCount <= 1) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.users.deleteUserHeading")}</h1>
        <p className="text-sm text-zinc-900 dark:text-zinc-50">
          <strong>{user.email}</strong>
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t(loc, "admin.users.cannotDeleteLastAdmin")}
        </p>
        <a href="/admin/users" className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.users.backToUsers")}</a>
      </div>
    );
  }

  // ─── Normal confirm UI (both guards passed) ───
  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.users.deleteUserHeading")}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t(loc, "admin.users.deleteWarning")}
      </p>
      <dl className="space-y-2 mt-4">
        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.users.colEmail")}</dt>
        <dd className="text-sm text-zinc-900 dark:text-zinc-50">{user.email}</dd>
        <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.users.colRole")}</dt>
        <dd className="text-sm text-zinc-900 dark:text-zinc-50">{user.role}</dd>
      </dl>
      <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 mt-4">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          <strong>{t(loc, "admin.users.deleteWarningLabel")}</strong> {t(loc, "admin.users.deleteWarningNote")}
        </p>
      </div>
      <form action={deleteUserFormAction.bind(null, id)} className="mt-4">
        <button type="submit" className="rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{t(loc, "admin.users.confirmDeleteUser")}</button>
      </form>
      <a href="/admin/users" className="mt-4 inline-block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.common.cancel")}</a>
    </div>
  );
}

export default function DeleteUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <DeleteUserContent params={params} />
    </Suspense>
  );
}
