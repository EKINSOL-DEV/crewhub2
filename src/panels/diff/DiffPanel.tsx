// Diff viewer panel (M3 T16, EKI-105): read-only "what changed?" for a
// project — file list with ±counts, per-file patches rendered as shiki
// `diff` blocks, base switcher (working tree ↔ merge-base vs default
// branch), truncation rendered honestly. No stage/discard — read-only is
// the contract (master plan Epic 15).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectFilter } from "@/app/project-filter";
import { EmptyState } from "@/components/EmptyState";
import { CodeBlock } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { commands, type DiffFile, type GitDiff } from "@/ipc/bindings";
import type { PanelProps } from "@/panels/registry";
import { parseUnifiedDiff } from "./diff-parse";

const STATUS_LABEL: Record<string, string> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type changed",
  U: "unmerged",
  B: "binary",
};

const STATUS_CLASS: Record<string, string> = {
  A: "text-green-500",
  D: "text-red-500",
  R: "text-blue-400",
  C: "text-blue-400",
  U: "text-purple-400",
  B: "text-muted-foreground",
};

function FileRow({ file, selected, onSelect }: { file: DiffFile; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      data-testid={`diff-file-${file.path}`}
      onClick={onSelect}
      className={`flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs ${
        selected ? "bg-accent/20" : "hover:bg-accent/10"
      }`}
    >
      <span
        className={`w-3 shrink-0 font-mono font-semibold ${STATUS_CLASS[file.status] ?? "text-yellow-500"}`}
        title={STATUS_LABEL[file.status] ?? file.status}
      >
        {file.status}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
        {file.path}
      </span>
      {file.status !== "B" && (
        <span className="shrink-0 font-mono text-muted-foreground">
          <span className="text-green-500">+{file.additions}</span>{" "}
          <span className="text-red-500">−{file.deletions}</span>
        </span>
      )}
    </button>
  );
}

function PatchView({ file }: { file: DiffFile }) {
  const parsed = useMemo(() => parseUnifiedDiff(file.patch).files[0], [file.patch]);
  if (file.status === "B" || parsed?.status === "binary") {
    return <p className="p-3 text-xs text-muted-foreground">🖼️ binary file — nothing to render</p>;
  }
  if (!parsed || parsed.hunks.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        no textual changes (mode or metadata only)
        {file.patch === "" ? " — the patch was capped, see the banner" : ""}
      </p>
    );
  }
  return (
    <div data-testid="diff-patch" className="flex flex-col gap-2 p-2">
      {parsed.oldPath && (
        <p className="px-1 font-mono text-xs text-muted-foreground">
          {parsed.oldPath} → {parsed.path}
        </p>
      )}
      {parsed.hunks.map((h) => (
        <CodeBlock key={h.header + h.text.length} code={h.text} lang="diff" />
      ))}
      {parsed.truncated && (
        <p className="px-1 text-xs text-muted-foreground">✂️ this file's patch was capped mid-hunk</p>
      )}
    </div>
  );
}

export default function DiffPanel({ params, setParams }: PanelProps) {
  const { project, projects } = useProjectFilter();
  // Param-pinned project wins; otherwise follow the tab's project filter live.
  const projectPath = params.projectPath ?? project?.folder_path ?? null;
  const base = params.base ?? null;

  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [defaultBaseEntry, setDefaultBaseEntry] = useState<{ path: string; base: string } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // setState only happens in async callbacks (the HistoryPanel pattern) —
  // the previous diff keeps rendering while a refresh is in flight.
  const load = useCallback(() => {
    if (!projectPath) return;
    commands
      .gitDiff(projectPath, base)
      .then((res) => {
        if (res.status === "ok" && res.data && Array.isArray(res.data.files)) {
          setDiff(res.data);
          setUnavailable(false);
          setError(null);
        } else if (res.status === "error") {
          if (res.error.startsWith("GitUnavailable:")) {
            setUnavailable(true); // not a repo / no git — quiet, not an error wall
            setDiff(null);
            setError(null);
          } else {
            setError(res.error); // e.g. unknown base ref — honest but small
          }
        }
      })
      .catch(() => undefined); // IPC bridge unavailable (unit tests)
  }, [projectPath, base]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    commands
      .gitDefaultBase(projectPath)
      .then((res) => {
        if (!cancelled && res.status === "ok" && typeof res.data === "string") {
          setDefaultBaseEntry({ path: projectPath, base: res.data });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectPath]);
  // Keyed by path so a project switch never shows the old repo's base.
  const defaultBase = defaultBaseEntry?.path === projectPath ? defaultBaseEntry.base : null;

  const files = useMemo(() => diff?.files ?? [], [diff]);
  const selectedFile = files.find((f) => f.path === selected) ?? files[0] ?? null;

  if (!projectPath) {
    return (
      <EmptyState
        emoji="🗺️"
        title="Which project's changes?"
        hint="Pick a project (or set the tab's project filter)"
        action={
          <span className="flex flex-wrap justify-center gap-1">
            {projects.map((p) => (
              <Button
                key={p.id}
                size="xs"
                variant="outline"
                onClick={() => setParams({ ...params, projectPath: p.folder_path })}
              >
                {p.icon ?? "📁"} {p.name}
              </Button>
            ))}
          </span>
        }
      />
    );
  }

  if (unavailable) {
    return (
      <EmptyState
        emoji="🤷"
        title="No git info here"
        hint="This project isn't a git repository (or git isn't on the PATH)"
      />
    );
  }

  const projectLabel = projects.find((p) => p.folder_path === projectPath)?.name ?? projectPath;

  return (
    <div data-testid="diff-panel" className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <span className="font-medium">🔬 Diff</span>
        <span className="truncate font-mono text-muted-foreground" title={projectPath}>
          {projectLabel}
        </span>
        <select
          data-testid="diff-base-select"
          aria-label="Diff base"
          className="rounded border bg-card px-1 py-0.5 text-xs"
          value={base ?? ""}
          onChange={(e) => {
            const next: Record<string, string> = { ...params, projectPath };
            if (e.target.value) next.base = e.target.value;
            else delete next.base;
            setParams(next);
          }}
        >
          <option value="">working tree vs HEAD</option>
          {defaultBase && <option value={defaultBase}>vs {defaultBase}</option>}
          {base && base !== defaultBase && <option value={base}>vs {base}</option>}
        </select>
        <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">read-only</span>
        <span className="ml-auto" />
        <Button size="xs" variant="outline" data-testid="diff-refresh" onClick={load}>
          ⟳ refresh
        </Button>
      </header>

      {diff?.truncated && (
        <p
          data-testid="diff-truncated"
          className="border-b border-border bg-accent/10 px-3 py-1 text-xs text-muted-foreground"
        >
          ✂️ this diff was truncated (size caps) — large patches render partially
        </p>
      )}
      {error && (
        <p data-testid="diff-error" className="border-b border-border px-3 py-1 text-xs text-red-400">
          {error}
        </p>
      )}

      {diff && files.length === 0 && (
        <EmptyState
          emoji="🧘"
          title={base ? `Nothing differs from ${base}` : "Working tree is clean"}
          hint="🧹 spotless — go make a mess"
        />
      )}

      {files.length > 0 && (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-60 shrink-0 flex-col gap-0.5 overflow-auto border-r border-border p-1.5">
            {files.map((f) => (
              <FileRow
                key={f.path}
                file={f}
                selected={f.path === selectedFile?.path}
                onSelect={() => setSelected(f.path)}
              />
            ))}
          </aside>
          <main className="min-h-0 flex-1 overflow-auto">
            {selectedFile && <PatchView file={selectedFile} />}
          </main>
        </div>
      )}
    </div>
  );
}
