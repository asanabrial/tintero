// Pure LCS-based line diff. Zero deps. No Next/React/DB imports.

export type DiffLine = { kind: "same" | "add" | "remove"; text: string };

/**
 * Computes a line-level diff from oldText to newText using an LCS table.
 * "same" = unchanged line, "add" = line present only in newText,
 * "remove" = line present only in oldText. Order is preserved.
 * Both empty → []; one-side empty yields a leading blank-line remove/add
 * because "".split("\n") === [""], not [].
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  if (oldText === "" && newText === "") return [];

  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table: lcs[i][j] = LCS length of a[i..n-1] vs b[j..m-1]
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  // Backtrack forward to emit diff in original order.
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "remove", text: a[i] });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "remove", text: a[i++] });
  while (j < m) out.push({ kind: "add", text: b[j++] });
  return out;
}
