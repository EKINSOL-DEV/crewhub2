// Pure unified-diff parser (M3 T16, EKI-105): `git diff` text → files with
// hunks, ready for the shiki `diff` highlighter. No IO, no React — TDD'd
// against rename/binary/mode-change/truncation fixtures. The backend caps
// patches (256 KB/file, 4 MB total), so a hunk may end mid-flight: declared
// @@ counts that the body doesn't meet flag the file `truncated`.

export interface DiffHunk {
  /** The `@@ -a,b +c,d @@ <context>` line. */
  header: string;
  /** Header + body lines — feed straight to a `diff` code block. */
  text: string;
}

export type DiffFileStatus = "added" | "deleted" | "modified" | "renamed" | "binary" | "mode";

export interface ParsedDiffFile {
  /** b-side path. */
  path: string;
  /** a-side path when renamed. */
  oldPath: string | null;
  status: DiffFileStatus;
  hunks: DiffHunk[];
  /** Patch was cut by the backend size caps mid-hunk. */
  truncated: boolean;
}

const HUNK_RE = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

interface Building {
  file: ParsedDiffFile;
  /** Declared (old, new) line counts of the open hunk. */
  declared: [number, number] | null;
  /** Seen (old, new) line counts of the open hunk. */
  seen: [number, number];
  lines: string[];
}

function closeHunk(b: Building): void {
  if (b.lines.length === 0) return;
  b.file.hunks.push({ header: b.lines[0] ?? "", text: b.lines.join("\n") });
  if (b.declared && (b.seen[0] < b.declared[0] || b.seen[1] < b.declared[1])) {
    b.file.truncated = true;
  }
  b.declared = null;
  b.seen = [0, 0];
  b.lines = [];
}

export function parseUnifiedDiff(text: string): { files: ParsedDiffFile[] } {
  const files: ParsedDiffFile[] = [];
  let b: Building | null = null;

  const close = () => {
    if (!b) return;
    closeHunk(b);
    if (b.file.status === "mode" && b.file.hunks.length > 0) b.file.status = "modified";
    files.push(b.file);
    b = null;
  };

  for (const line of text.split("\n")) {
    const header = line.startsWith("diff --git ") ? line.slice("diff --git ".length) : null;
    if (header !== null) {
      close();
      const bPath = header.includes(" b/") ? (header.split(" b/").pop() ?? header) : header;
      b = {
        file: { path: bPath, oldPath: null, status: "modified", hunks: [], truncated: false },
        declared: null,
        seen: [0, 0],
        lines: [],
      };
      continue;
    }
    if (!b) continue; // preamble before any file header — not a diff

    const open = b.declared !== null || b.lines.length > 0;
    const m = HUNK_RE.exec(line);
    if (m) {
      closeHunk(b);
      b.declared = [Number.parseInt(m[1] ?? "1", 10), Number.parseInt(m[2] ?? "1", 10)];
      b.lines = [line];
      continue;
    }
    if (open) {
      if (line === "") continue; // trailing split artifact — not a hunk line
      // hunk body: context/old/new lines count toward the declared totals
      if (line.startsWith(" ")) {
        b.seen[0] += 1;
        b.seen[1] += 1;
      } else if (line.startsWith("-")) {
        b.seen[0] += 1;
      } else if (line.startsWith("+")) {
        b.seen[1] += 1;
      }
      // "\ No newline at end of file" counts nowhere — just carried along
      b.lines.push(line);
      continue;
    }

    // file header zone
    if (line.startsWith("new file mode")) b.file.status = "added";
    else if (line.startsWith("deleted file mode")) b.file.status = "deleted";
    else if (line.startsWith("rename from ")) {
      b.file.status = "renamed";
      b.file.oldPath = line.slice("rename from ".length);
    } else if (line.startsWith("rename to ")) {
      b.file.status = "renamed";
      b.file.path = line.slice("rename to ".length);
    } else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      b.file.status = "binary";
    } else if (line.startsWith("old mode ") && b.file.status === "modified") {
      b.file.status = "mode";
    }
  }
  close();
  return { files };
}
