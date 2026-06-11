// Pure line diff for the hooks preview (T9, D-M6-1 / master-plan R3): the
// wizard shows the EXACT settings text the installer would write, with the
// added fenced block highlighted. Classic LCS — settings files are tiny.

export interface DiffLine {
  text: string;
  kind: "same" | "added" | "removed";
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // LCS table (a.length+1 × b.length+1)
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ text: a[i]!, kind: "same" });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ text: a[i]!, kind: "removed" });
      i++;
    } else {
      out.push({ text: b[j]!, kind: "added" });
      j++;
    }
  }
  while (i < a.length) out.push({ text: a[i++]!, kind: "removed" });
  while (j < b.length) out.push({ text: b[j++]!, kind: "added" });
  return out;
}
