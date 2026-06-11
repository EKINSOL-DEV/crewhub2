// Wizard detect step (T8, D-M6-3): probe for the Claude Code CLI. Found ⇒
// path + version, persisted backend-side so the provider picks it up.
// Missing ⇒ a first-class screen (never an error toast): guided install
// copy + a manual path field that re-probes through `set_cli_path`.
// The v1-database banner (T10's importer entry point) also lives here.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { commands } from "@/ipc/bindings";
import { useOnboarding } from "@/stores/onboarding";
import { ImportV1Dialog } from "../ImportDialog";

function StatusLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden>{ok ? "✅" : "▫️"}</span>
      <span>{children}</span>
    </p>
  );
}

/** Manual path picker + re-probe (the missing-CLI branch's escape hatch). */
function ManualPathPicker() {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  async function applyManualPath() {
    setProbing(true);
    setError(null);
    try {
      const res = await commands.setCliPath(path.trim());
      if (res.status === "error") {
        setError(res.error);
      } else {
        // persisted — refresh the report so the found-branch renders
        await useOnboarding.getState().detect();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted-foreground" htmlFor="cli-path-input">
        Already installed somewhere unusual? Point me at the binary:
      </label>
      <div className="flex gap-1.5">
        <input
          id="cli-path-input"
          data-testid="cli-path-input"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/path/to/claude"
          spellCheck={false}
          className="min-w-0 flex-1 rounded border bg-background px-2 py-1 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="sm"
          variant="outline"
          data-testid="cli-path-apply"
          disabled={path.trim() === "" || probing}
          onClick={() => void applyManualPath()}
        >
          {probing ? "Probing…" : "Use this path"}
        </Button>
      </div>
      {error && (
        <p data-testid="cli-path-error" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function DetectStep() {
  const env = useOnboarding((s) => s.env);
  const detecting = useOnboarding((s) => s.detecting);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!useOnboarding.getState().env) void useOnboarding.getState().detect();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">🔍 Finding your Claude Code CLI</h2>

      {detecting && !env ? (
        <p data-testid="detect-probing" className="text-sm text-muted-foreground">
          Sniffing around your PATH and the usual install spots… 🐕
        </p>
      ) : env?.cli_path ? (
        <div className="flex flex-col gap-1.5" data-testid="detect-found">
          <p className="text-sm">
            ✅ Found it: <code className="rounded bg-muted px-1 font-mono text-xs">{env.cli_path}</code>
          </p>
          {env.cli_version && <p className="text-xs text-muted-foreground">{env.cli_version}</p>}
          <p className="text-xs text-muted-foreground">
            Saved — CrewHub will use this binary for every session it spawns.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="detect-missing">
          <p className="text-sm">
            🤔 No Claude Code CLI found on this machine — CrewHub can still watch existing transcripts, but it
            needs the CLI to spawn sessions.
          </p>
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Install it, then come back:</p>
            <pre className="overflow-x-auto rounded bg-background p-2 font-mono">
              npm install -g @anthropic-ai/claude-code
            </pre>
            <p className="mt-1">
              (or the native installer from <code className="font-mono">https://claude.com/claude-code</code>{" "}
              — we never run installers for you)
            </p>
          </div>
          <ManualPathPicker />
          <div>
            <Button
              size="sm"
              variant="outline"
              data-testid="detect-reprobe"
              disabled={detecting}
              onClick={() => void useOnboarding.getState().detect()}
            >
              {detecting ? "Probing…" : "🔄 Probe again"}
            </Button>
          </div>
        </div>
      )}

      {env && (
        <div className="flex flex-col gap-0.5 border-t pt-2">
          <StatusLine ok={env.claude_dir}>
            {env.claude_dir
              ? "Claude Code has run on this machine before (~/.claude exists)"
              : "No ~/.claude yet — it appears after the CLI's first run"}
          </StatusLine>
          <StatusLine ok={env.claude_projects}>
            {env.claude_projects
              ? "Found session transcripts — the next step can suggest recent projects"
              : "No transcripts yet — you'll pick project folders by hand"}
          </StatusLine>
        </div>
      )}

      {env?.v1_db && (
        <div
          data-testid="v1-banner"
          className="flex items-center gap-2 rounded-md border bg-muted/40 p-2.5 text-sm"
        >
          <span className="min-w-0 flex-1">📦 CrewHub v1 found on this machine — bring your crew?</span>
          <Button size="sm" data-testid="v1-import-open" onClick={() => setImportOpen(true)}>
            Preview import
          </Button>
        </div>
      )}
      {importOpen && env?.v1_db && (
        <ImportV1Dialog defaultDbPath={env.v1_db} onClose={() => setImportOpen(false)} />
      )}
    </div>
  );
}
