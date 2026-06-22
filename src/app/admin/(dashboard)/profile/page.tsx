// Profile page — server component.
// verifySession() is called FIRST inside the inner async component.
// NO 'use cache' directive — this route must render dynamically.

import { Suspense } from "react";
import { verifySession } from "@/lib/auth/dal";
import { getUserRepository } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";
import { AdminPageHeader } from "../_components/admin-page-header";
import { updateOwnPasswordAction, updateProfileAction } from "./actions";
import { ProfilePasswordForm } from "./profile-password-form";
import { ProfileInfoForm } from "./profile-info-form";

interface ProfilePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function ProfileContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await verifySession();
  const user = await getUserRepository().findById(session.userId);
  const params = await searchParams;
  const saved = params["saved"] === "1";
  const { language: loc } = await getLayoutSiteConfig();

  if (!user) {
    return (
      <div>
        <AdminPageHeader title={t(loc, "admin.profile.title")} />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(loc, "admin.profile.accountUnavailable")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <AdminPageHeader title={t(loc, "admin.profile.title")} />

      <dl className="space-y-3 mb-8">
        <div>
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.profile.email")}</dt>
          <dd className="text-sm text-zinc-900 dark:text-zinc-50">{user.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.profile.role")}</dt>
          <dd className="text-sm text-zinc-900 dark:text-zinc-50">{user.role}</dd>
        </div>
        {user.name && (
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.profile.displayName")}</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{user.name}</dd>
          </div>
        )}
        {user.bio && (
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t(loc, "admin.profile.bio")}</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{user.bio}</dd>
          </div>
        )}
      </dl>

      <hr className="my-8 border-zinc-200 dark:border-zinc-800" />
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">{t(loc, "admin.profile.displayNameBio")}</h2>
      {saved && (
        <div role="status" aria-live="polite" className="mb-4 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2">
          <p className="text-sm text-green-700 dark:text-green-400">{t(loc, "admin.profile.updated")}</p>
        </div>
      )}
      <ProfileInfoForm action={updateProfileAction} defaultName={user.name} defaultBio={user.bio} />

      <hr className="my-8 border-zinc-200 dark:border-zinc-800" />
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">{t(loc, "admin.profile.passwordSection")}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
        {t(loc, "admin.profile.sessionNote")}
      </p>
      <ProfilePasswordForm action={updateOwnPasswordAction} />
    </div>
  );
}

export default function ProfilePage({ searchParams }: ProfilePageProps) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ProfileContent searchParams={searchParams} />
    </Suspense>
  );
}
