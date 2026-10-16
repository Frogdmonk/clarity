export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Line diff via LCS. Inputs are capped (2000 lines) so a pathological paste cannot freeze the tab. */
export function diffLines(a: string, b: string, cap = 2000): DiffLine[] {
  const A = a.split("\n").slice(0, cap);
  const B = b.split("\n").slice(0, cap);
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = A[i] === B[j] ? (dp[i + 1]![j + 1] ?? 0) + 1 : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ kind: "same", text: A[i]! }); i++; j++; }
    else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) { out.push({ kind: "del", text: A[i]! }); i++; }
    else { out.push({ kind: "add", text: B[j]! }); j++; }
  }
  while (i < n) out.push({ kind: "del", text: A[i++]! });
  while (j < m) out.push({ kind: "add", text: B[j++]! });
  return out;
}
