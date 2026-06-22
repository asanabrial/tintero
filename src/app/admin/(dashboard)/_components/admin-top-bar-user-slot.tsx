import Link from "next/link";
import { verifySession } from "@/lib/auth/dal";
import { getUserRepository } from "@/lib/auth/factory";
import { t } from "@/lib/i18n";
import { logout } from "../../login/actions";

export async function AdminTopBarUserSlot({ locale }: { locale: string }) {
  const session = await verifySession(); // react cache() deduped — no extra DB hit

  let displayName: string | null = null;
  try {
    const user = await getUserRepository().findById(session.userId);
    displayName = user?.name?.trim() || user?.email || null;
  } catch {
    displayName = null; // DB unavailable → degrade to sign-out only
  }

  const initial = displayName ? displayName.charAt(0).toUpperCase() : "?";

  return (
    <div className="flex items-center gap-2.5">
      {displayName ? (
        // WordPress-style "Howdy, {name}" greeting with an avatar initial.
        <Link
          href="/admin/profile"
          className="flex items-center gap-2 text-xs text-zinc-300 transition-colors hover:text-white"
        >
          <span>{t(locale, "admin.howdy", { name: displayName })}</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2271b1] text-[10px] font-semibold uppercase text-white">
            {initial}
          </span>
        </Link>
      ) : null}
      <span className="text-zinc-600" aria-hidden="true">
        |
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="text-xs text-zinc-300 transition-colors hover:text-white"
        >
          {t(locale, "admin.signOut")}
        </button>
      </form>
    </div>
  );
}
