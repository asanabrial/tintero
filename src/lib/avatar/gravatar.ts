import { createHash } from "node:crypto";

export function gravatarUrl(
  email: string,
  opts?: { size?: number; default?: string }
): string {
  const normalized = email.trim().toLowerCase();
  const hash = createHash("md5").update(normalized).digest("hex");
  const size = opts?.size ?? 80;
  const d = opts?.default ?? "mp";
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${d}`;
}
