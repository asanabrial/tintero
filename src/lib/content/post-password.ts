import { createHash } from "node:crypto";

/**
 * Derives the value stored in the `pp_<slug>` unlock cookie for a
 * password-protected post. Hashing avoids persisting the plaintext post
 * password in the visitor's cookie (defense-in-depth vs. log/infra exposure);
 * the gate compares the cookie against the hash of the post's frontmatter
 * password, so the logical check is unchanged.
 */
export function hashPostPassword(password: string): string {
  return createHash("sha256").update(`tintero-pp:${password}`).digest("hex");
}
