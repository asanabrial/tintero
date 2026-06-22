/**
 * Pure helper: extract, trim, and deduplicate selected filenames from bulk-delete FormData.
 * No framework imports — safe to unit-test with bun:test.
 */
export function parseSelectedMediaFilenames(formData: FormData): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of formData.getAll("filename")) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (s.length === 0 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
