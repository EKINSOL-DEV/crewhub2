// Wizard integrations step (T9, D-M6-1/4): three opt-ins, every one
// individually declinable. The hooks card renders the REAL preview diff
// (`preview_hooks_install` — the exact would-be settings text, added block
// highlighted, master-plan R3's promise); Windows hides it honestly
// (`supported: false` — UDS bridge; watcher-only there). MCP enables per
// created project; notifications seed the T4 default attention rules.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type HooksStatus } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/stores/onboarding";
import { useProjectsStore } from "@/stores/projects";
import { diffLines, type DiffLine } from "../diff";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-md border p-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <pre
      data-testid="hooks-diff"
      className="max-h-48 overflow-auto rounded border bg-background p-2 font-mono text-[11px] leading-relaxed"
    >
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            l.kind === "added" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            l.kind === "removed" && "bg-red-500/15 text-red-700 dark:text-red-300 line-through",
          )}
        >
          {l.kind === "added" ? "+ " : l.kind === "removed" ? "- " : "  "}
          {l.text}
        </div>
      ))}
    </pre>
  );
}

function HooksCard() {
  const [status, setStatus] = useState<HooksStatus | null>(null);
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    commands
      .hooksStatus()
      .then((res) => setStatus(res.status === "ok" ? res.data : null))
      .catch(() => setStatus(null));
  }, []);

  // Windows (or status unavailable): the hooks step is hidden — the app runs
  // watcher-only and the copy says so honestly (D-M6-1).
  if (status === null) return null;
  if (!status.supported) {
    return (
      <Card title="⚡ Instant status hooks">
        <p className="text-xs text-muted-foreground" data-testid="hooks-unsupported">
          Not available on Windows yet — CrewHub watches transcripts instead, which works fine, just a beat
          slower.
        </p>
      </Card>
    );
  }

  async function preview() {
    setError(null);
    try {
      const res = await commands.previewHooksInstall();
      if (res.status === "ok") setDiff(diffLines(res.data.before, res.data.after));
      else setError(res.error);
    } catch (e) {
      setError(String(e));
    }
  }

  async function apply(install: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = install ? await commands.installHooks() : await commands.uninstallHooks();
      if (res.status === "ok") {
        setStatus(res.data);
        setDiff(null);
      } else setError(res.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="⚡ Instant status hooks">
      {status.installed ? (
        <p className="text-xs" data-testid="hooks-installed">
          ✅ Installed — agents report status the moment it changes.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Lets sessions ping CrewHub the instant something happens, instead of waiting for the file watcher.
          It adds a small fenced block to <code className="font-mono">{status.settings_path}</code> — preview
          the exact text first; uninstall restores the file byte-identical.
        </p>
      )}
      {diff && <DiffView lines={diff} />}
      <div className="flex gap-1.5">
        {!status.installed && !diff && (
          <Button size="xs" variant="outline" data-testid="hooks-preview" onClick={() => void preview()}>
            👀 Preview what gets written
          </Button>
        )}
        {!status.installed && diff && (
          <Button size="xs" data-testid="hooks-install" disabled={busy} onClick={() => void apply(true)}>
            Install hooks
          </Button>
        )}
        {status.installed && (
          <Button
            size="xs"
            variant="outline"
            data-testid="hooks-uninstall"
            disabled={busy}
            onClick={() => void apply(false)}
          >
            Uninstall (byte-identical restore)
          </Button>
        )}
        {diff && !status.installed && (
          <Button size="xs" variant="ghost" onClick={() => setDiff(null)}>
            No thanks
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  );
}

function McpCard() {
  const createdIds = useOnboarding((s) => s.createdProjectIds);
  const sampleCrew = useOnboarding((s) => s.sampleCrew);
  const projects = useProjectsStore((s) => s.projects);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const wizardProjects = projects.filter((p) => createdIds.includes(p.id) || p.id === sampleCrew?.project_id);

  async function toggle(projectId: string, on: boolean) {
    setError(null);
    try {
      const res = on
        ? await commands.enableMcpForProject(projectId)
        : await commands.disableMcpForProject(projectId);
      if (res.status === "error") {
        setError(res.error);
        return;
      }
      setEnabled((prev) => {
        const next = new Set(prev);
        if (on) next.add(projectId);
        else next.delete(projectId);
        return next;
      });
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Card title="🛠️ CrewHub tools for agents (MCP)">
      <p className="text-xs text-muted-foreground">
        Gives sessions in a project board tools — they can move their own tasks and post status updates. Per
        project, off by default.
      </p>
      {wizardProjects.length === 0 ? (
        <p className="text-xs italic text-muted-foreground" data-testid="mcp-no-projects">
          No projects registered this run — enable MCP later from a project's context menu.
        </p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="mcp-projects">
          {wizardProjects.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  aria-label={`Enable MCP for ${p.name}`}
                  checked={enabled.has(p.id)}
                  onChange={(e) => void toggle(p.id, e.target.checked)}
                />
                {p.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  );
}

function NotificationsCard() {
  const [seeded, setSeeded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function seed() {
    setError(null);
    try {
      const res = await commands.seedDefaultNotificationRules();
      if (res.status === "ok") setSeeded(res.data.length);
      else setError(res.error);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Card title="🔔 Attention notifications">
      {seeded !== null ? (
        <p className="text-xs" data-testid="notifications-seeded">
          {seeded > 0
            ? `✅ ${seeded} rules added — permission requests, stops, errors and finished meetings will reach you.`
            : "✅ Already set up — your existing rules were left alone."}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Get a toast + OS notification when an agent needs you: a permission to grant, a session that
            stopped, a meeting that wrapped up. Fully editable in Settings; off until you opt in.
          </p>
          <div>
            <Button size="xs" variant="outline" data-testid="seed-notifications" onClick={() => void seed()}>
              Turn on attention notifications
            </Button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  );
}

export function IntegrationsStep() {
  useEffect(() => {
    void useProjectsStore.getState().load();
  }, []);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">🔌 Integrations</h2>
      <p className="text-sm text-muted-foreground">
        All optional, all reversible — decline any of them and CrewHub still works.
      </p>
      <HooksCard />
      <McpCard />
      <NotificationsCard />
    </div>
  );
}
