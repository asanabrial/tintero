// Change password page — server component.
// NO 'use cache' — calls verifySession() which reads cookies (forces dynamic rendering).
// verifySession() is called FIRST inside the content component (spec: Auth Gate).
//
// Note: changing your own password does NOT invalidate the current session.
// JWT tokens do not carry the password hash, so the existing token remains valid.
// This is expected behavior, not a bug.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getUserRepository } from "@/lib/auth";
import { getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { updatePasswordAction } from "../../actions";
import { PasswordForm } from "./password-form";

interface ChangePasswordContentProps {
  params: Promise<{ id: string }>;
}

async function ChangePasswordContent({ params }: ChangePasswordContentProps) {
  // Auth gate — must be first; redirects to /admin/login on failure
  const session = await verifySession();
  if (!can(session.role, "users:manage")) redirect("/admin");
  const { language: loc } = await getLayoutSiteConfig();

  const { id } = await params;

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">{t(loc, "admin.users.changePasswordTitle")}</h1>
      <PasswordForm
        action={updatePasswordAction.bind(null, id)}
        email={user.email}
      />
      <a href="/admin/users" className="mt-4 inline-block text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 underline">{t(loc, "admin.common.cancel")}</a>
    </div>
  );
}

export default function ChangePasswordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ChangePasswordContent params={params} />
    </Suspense>
  );
}
