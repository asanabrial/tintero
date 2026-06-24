"use client";

import { useState } from "react";
// Import types from the pure types module ONLY — never from @/lib/auth barrel
// (barrel re-exports server factory / node:fs → client-bundle build FAILS).
import type { PublicUser } from "@/lib/auth/types";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/app/components/ui/button";
import { useColumnVisibility } from "../../_components/use-column-visibility";
import { Avatar } from "@/app/components/avatar";

// WordPress "Screen Options" — toggleable columns for the users list (Email is
// always shown; persisted via useColumnVisibility under this key).
const COLUMNS_STORAGE_KEY = "tintero-users-hidden-columns";
const TOGGLE_COLUMNS = [
  { key: "role", label: "Role" },
  { key: "created", label: "Created" },
] as const;

export function UsersTable({
  users,
  selfId,
  bulkDeleteAction,
}: {
  users: PublicUser[];
  selfId: string;
  bulkDeleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const tr = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // WordPress-style single "Bulk actions" dropdown: pick one action, click Apply.
  const [bulkAction, setBulkAction] = useState<"" | "delete">("");
  // Screen Options — column visibility (persisted in localStorage, no SSR mismatch).
  const [screenOptionsOpen, setScreenOptionsOpen] = useState(false);
  const { isVisible, toggleColumn } = useColumnVisibility(COLUMNS_STORAGE_KEY);

  const allSelected = users.length > 0 && selected.size === users.length;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(users.map((u) => u.id)));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {/* WordPress "Screen Options" — a disclosure that toggles column visibility. */}
      <div className="mb-2 flex justify-end">
        <div className="relative">
          <button
            type="button"
            onClick={() => setScreenOptionsOpen((o) => !o)}
            aria-expanded={screenOptionsOpen}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {tr("admin.table.screenOptions")}
          </button>
          {screenOptionsOpen && (
            <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {tr("admin.table.columns")}
              </p>
              <div className="space-y-1.5">
                {TOGGLE_COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                  >
                    <input
                      type="checkbox"
                      checked={isVisible(col.key)}
                      onChange={() => toggleColumn(col.key)}
                    />
                    {col.key === "role" ? tr("admin.users.colRole") : tr("admin.users.colCreated")}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WordPress-style tablenav: a single "Bulk actions" dropdown + Apply,
          always visible above the table. */}
      <form
        action={bulkDeleteAction}
        onSubmit={(e) => {
          if (bulkAction === "" || selected.size === 0) {
            e.preventDefault();
            return;
          }
          if (
            !window.confirm(
              tr("admin.users.confirmBulkDelete", { count: selected.size })
            )
          ) {
            e.preventDefault();
          }
        }}
        className="mb-2 flex items-center gap-2"
      >
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="userId" value={id} />
        ))}
        <label htmlFor="bulk-action-users" className="sr-only">
          {tr("admin.users.selectBulkAction")}
        </label>
        <select
          id="bulk-action-users"
          value={bulkAction}
          onChange={(e) => setBulkAction(e.target.value as typeof bulkAction)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-[#2271b1] focus:outline-none focus:ring-1 focus:ring-[#2271b1] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="">{tr("admin.table.bulkActions")}</option>
          <option value="delete">{tr("admin.common.deletePermanently")}</option>
        </select>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={bulkAction === "" || selected.size === 0}
        >
          {tr("admin.common.apply")}
        </Button>
        {selected.size > 0 && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {tr("admin.common.selected", { count: selected.size })}
          </span>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-2.5 px-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = !allSelected && selected.size > 0;
                    }
                  }}
                  onChange={toggleAll}
                  aria-label={tr("admin.users.selectAll")}
                />
              </th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {tr("admin.users.colEmail")}
              </th>
              {isVisible("role") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.users.colRole")}
                </th>
              )}
              {isVisible("created") && (
                <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  {tr("admin.users.colCreated")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="group border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
              >
                <td className="py-2.5 px-3 align-top">
                  <input
                    type="checkbox"
                    checked={selected.has(user.id)}
                    onChange={() => toggleOne(user.id)}
                    aria-label={tr("admin.users.selectUser", { email: user.email })}
                  />
                </td>
                {/* Avatar + email + WordPress-style row actions (revealed on hover/focus).
                    Gravatar from user email (pre-computed server-side); falls back to initial circle.
                    Email is bold text (not a link) — all per-user actions are equally secondary. */}
                <td className="py-2.5 px-3 align-top">
                  <div className="flex items-start gap-2.5">
                    <Avatar
                      src={user.avatarUrl ?? `https://www.gravatar.com/avatar/?d=mp&s=32`}
                      name={user.name?.trim() || user.email}
                      size={32}
                      className="mt-0.5"
                    />
                    <div>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {user.email}
                  </span>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 dark:text-zinc-400">
                    <a
                      href={`/admin/users/${user.id}/password`}
                      className="hover:text-[#2271b1] dark:hover:text-[#4f94d4]"
                    >
                      {tr("admin.users.changePassword")}
                    </a>
                    {/* Omit Change role for own row — self-role-change blocked server-side (ADR-4) */}
                    {user.id !== selfId && (
                      <>
                        <span aria-hidden="true">|</span>
                        <a
                          href={`/admin/users/${user.id}/role`}
                          className="hover:text-[#2271b1] dark:hover:text-[#4f94d4]"
                        >
                          {tr("admin.users.changeRole")}
                        </a>
                      </>
                    )}
                    {/* Omit Delete link for the current user's own row (UX defense-in-depth;
                        the action still enforces the self-delete guard server-side) */}
                    {user.id !== selfId && (
                      <>
                        <span aria-hidden="true">|</span>
                        <a
                          href={`/admin/users/${user.id}/delete`}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          {tr("admin.common.delete")}
                        </a>
                      </>
                    )}
                  </div>
                    </div>
                  </div>
                </td>
                {isVisible("role") && (
                  <td className="py-2.5 px-3 align-top text-zinc-700 dark:text-zinc-300">
                    {user.role}
                  </td>
                )}
                {isVisible("created") && (
                  <td className="py-2.5 px-3 align-top text-zinc-700 dark:text-zinc-300">
                    {user.createdAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
