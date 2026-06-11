// Tool Chips (D-M2-6) + one-line tool summaries — pure, table-tested.

const CHIPS: Array<[RegExp, string]> = [
  [/^Read$/, "📖"],
  [/^(Edit|Write|MultiEdit|NotebookEdit)$/, "✏️"],
  [/^Bash$/, "💻"],
  [/^(Grep|Glob)$/, "🔎"],
  [/^(WebFetch|WebSearch)$/, "🌐"],
  [/^mcp__crewhub/, "🏠"],
];

export function toolChip(tool: string): string {
  for (const [re, chip] of CHIPS) if (re.test(tool)) return chip;
  return "🛠️";
}

/** Best-effort human summary of a tool input ("src/foo.rs", "pnpm test", …). */
export function toolSummary(inputJson: string): string {
  let input: unknown;
  try {
    input = JSON.parse(inputJson);
  } catch {
    return "";
  }
  if (typeof input !== "object" || input === null) return "";
  const obj = input as Record<string, unknown>;
  for (const k of ["file_path", "path", "command", "pattern", "url", "query", "prompt", "description"]) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) {
      return v.length > 80 ? `${v.slice(0, 77)}…` : v;
    }
  }
  return "";
}

/** Pretty-print a JSON string; on parse failure return it untouched. */
export function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Collapse text beyond `maxLines` lines; reports whether it was truncated. */
export function clampLines(text: string, maxLines: number): { text: string; clamped: boolean } {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, clamped: false };
  return { text: lines.slice(0, maxLines).join("\n"), clamped: true };
}
