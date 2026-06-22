import { ButtonLink } from "@/app/components/ui/button";

interface AdminPageHeaderProps {
  title: string;
  actionHref?: string;
  actionLabel?: string;
}

export function AdminPageHeader({
  title,
  actionHref,
  actionLabel,
}: AdminPageHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {title}
      </h1>
      {actionHref && actionLabel ? (
        <ButtonLink href={actionHref} variant="accent">
          {actionLabel}
        </ButtonLink>
      ) : null}
    </div>
  );
}
