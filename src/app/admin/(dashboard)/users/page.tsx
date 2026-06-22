// Admin users list page — server component.
// NO 'use cache' — calls verifySession() which reads cookies (forces dynamic rendering).
// verifySession() is called FIRST inside the content component (spec: Auth Gate).

import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getUserRepository } from "@/lib/auth";
import { clampPage } from "@/lib/content";
import { t } from "@/lib/i18n";
import { getLayoutSiteConfig } from "@/lib/content";
import { createUserAction } from "./actions";
import { bulkDeleteUsersAction } from "./actions";
import { UserCreateForm } from "./user-create-form";
import { AdminPageHeader } from "../_components/admin-page-header";
import { UsersTable } from "./_components/users-table";
import { filterUsersByQuery } from "./_components/filter-users-by-query";
import { buildUsersListHref } from "./_components/build-users-list-href";
import { UsersSearchForm } from "./_components/users-search-form";

const PAGE_SIZE = 20;

async function UsersContent({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  // Auth gate — must be first; redirects to /admin/login on failure
  const session = await verifySession();
  if (!can(session.role, "users:manage")) redirect("/admin");

  const params = await searchParams;
  const requestedPage = parseInt(params.page ?? "1", 10) || 1;
  const q = (params.q ?? "").trim();
  const { language: loc } = await getLayoutSiteConfig();

  let users = null;
  let dbError = false;

  try {
    users = await getUserRepository().listUsers();
  } catch {
    dbError = true;
  }

  if (dbError) {
    return (
      <div>
        <AdminPageHeader title={t(loc, "admin.users.title")} />
        <p className="text-zinc-600 dark:text-zinc-400">{t(loc, "admin.users.usersUnavailable")}</p>
      </div>
    );
  }

  const allUsers = users ?? [];
  const filteredUsers = filterUsersByQuery(allUsers, q);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = clampPage(requestedPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageUsers = filteredUsers.slice(start, start + PAGE_SIZE);

  return (
    <div>
      <AdminPageHeader title={t(loc, "admin.users.title")} />

      {(filteredUsers.length > 0 || q !== "") && <UsersSearchForm q={q} loc={loc} />}

      {q !== "" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          {t(loc, "admin.users.searchResultsFor", { q, count: filteredUsers.length })}{" "}
          <Link href={buildUsersListHref({})} className="underline">
            {t(loc, "admin.users.clearSearch")}
          </Link>
        </p>
      )}

      {pageUsers.length === 0 ? (
        q !== "" ? (
          <p className="text-zinc-600 dark:text-zinc-400">{t(loc, "admin.users.noUsersMatch", { q })}</p>
        ) : (
          <p className="text-zinc-600 dark:text-zinc-400">{t(loc, "admin.users.noUsersFound")}</p>
        )
      ) : (
        <UsersTable
          users={pageUsers}
          selfId={session.userId}
          bulkDeleteAction={bulkDeleteUsersAction}
        />
      )}

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between mt-4 text-sm"
          aria-label={t(loc, "common.pagination")}
        >
          {safePage > 1 ? (
            <Link href={buildUsersListHref({ q, page: safePage - 1 })} className="underline" rel="prev">
              {t(loc, "common.previous")}
            </Link>
          ) : (
            <span className="text-zinc-400" aria-hidden>
              {t(loc, "common.previous")}
            </span>
          )}
          <span className="text-zinc-500 dark:text-zinc-400">
            {t(loc, "common.page", { page: safePage, total: totalPages })}
          </span>
          {safePage < totalPages ? (
            <Link href={buildUsersListHref({ q, page: safePage + 1 })} className="underline" rel="next">
              {t(loc, "common.next")}
            </Link>
          ) : (
            <span className="text-zinc-400" aria-hidden>
              {t(loc, "common.next")}
            </span>
          )}
        </nav>
      )}

      <hr className="my-8 border-zinc-200 dark:border-zinc-800" />
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4">{t(loc, "admin.users.createNewUser")}</h2>
      <UserCreateForm action={createUserAction} />
    </div>
  );
}

export default function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <UsersContent searchParams={searchParams} />
    </Suspense>
  );
}
