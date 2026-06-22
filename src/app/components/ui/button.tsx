import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "./form";

/**
 * The single button language for the admin. Before this, every surface rolled
 * its own button — dark-zinc header links, underlined row actions, blue form
 * submits — so the UI never felt unified. `Button` / `ButtonLink` / `SubmitButton`
 * all share these variants and sizes.
 */
export type ButtonVariant = "accent" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

const VARIANTS: Record<ButtonVariant, string> = {
  // Primary call to action — WordPress blue (#2271b1).
  accent:
    "bg-[#2271b1] text-white hover:bg-[#135e96] focus:ring-[#2271b1] dark:text-white",
  // Neutral, outlined.
  secondary:
    "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
  // Low-emphasis, no border until hovered.
  ghost:
    "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus:ring-zinc-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
  // Destructive.
  danger:
    "text-red-600 hover:bg-red-50 hover:text-red-700 focus:ring-red-500 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300",
  // Inline text action (table row actions) — minimal padding, underline on hover.
  link: "rounded text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline focus:ring-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-50",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string
): string {
  // The `link` variant carries its own minimal padding.
  const sizing = variant === "link" ? "text-xs" : SIZES[size];
  return cn(BASE, sizing, VARIANTS[variant], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...props} />
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Link styled as a button. Uses Next's `<Link>` for client navigation; external
 * targets (target="_blank") still work since same-origin admin links are
 * internal routes.
 */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props} />
  );
}
