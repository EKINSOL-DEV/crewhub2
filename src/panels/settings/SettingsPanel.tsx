// Settings panel (EKI-20): Appearance / Models / Permissions / Integrations.
// Lives in the registry like every panel AND in the dedicated settings window
// (`?window=settings`, capability file capabilities/settings.json).
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/ModelPicker";
import { commands, type McpStatus, type PermissionRule } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { ImportV1Dialog } from "@/onboarding/ImportDialog";
import { NotificationRulesSection } from "@/panels/board/NotificationRulesSection";
import { useSettings } from "@/stores/settings";
import {
  DENSITIES,
  FONT_SIZES,
  THEME_NAMES,
  THEMES,
  type Density,
  type FontSize,
  type ThemeName,
} from "@/theme/themes";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function ThemeSwatch({ name, active, onPick }: { name: ThemeName; active: boolean; onPick: () => void }) {
  const t = THEMES[name];
  return (
    <button
      type="button"
      data-testid={`theme-swatch-${name}`}
      aria-pressed={active}
      onClick={onPick}
      className={cn(
        "flex flex-col gap-1.5 rounded-md border p-2 text-left text-xs hover:bg-muted",
        active && "border-ring ring-1 ring-ring",
      )}
    >
      {/* live preview: the theme's own surface + accent colors */}
      <span
        className="flex h-8 items-center gap-1 rounded border px-1.5"
        style={{ background: t.vars["--background"], borderColor: t.vars["--border"] }}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: t.vars["--primary"] }} />
        <span className="h-2 w-8 rounded-sm" style={{ background: t.vars["--card"] }} />
        <span className="h-2 w-5 rounded-sm" style={{ background: t.vars["--muted-foreground"] }} />
      </span>
      <span className="truncate">{name}</span>
    </button>
  );
}

function Appearance() {
  const { theme, density, fontSize, setTheme, setDensity, setFontSize } = useSettings();
  return (
    <Section title="Appearance">
      <div className="grid grid-cols-3 gap-2">
        {THEME_NAMES.map((n) => (
          <ThemeSwatch key={n} name={n} active={n === theme} onPick={() => void setTheme(n)} />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="w-20 text-muted-foreground">Density</span>
        {DENSITIES.map((d) => (
          <Button
            key={d}
            size="sm"
            data-testid={`density-${d}`}
            variant={density === d ? "default" : "outline"}
            onClick={() => void setDensity(d as Density)}
          >
            {d}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-20 text-muted-foreground">Font size</span>
        {FONT_SIZES.map((f) => (
          <Button
            key={f}
            size="sm"
            data-testid={`font-${f}`}
            variant={fontSize === f ? "default" : "outline"}
            onClick={() => void setFontSize(f as FontSize)}
          >
            {f.toUpperCase()}
          </Button>
        ))}
      </div>
    </Section>
  );
}

function Models() {
  const { defaultSpawnModel, setDefaultSpawnModel } = useSettings();
  return (
    <Section title="Models">
      <p className="text-xs text-muted-foreground">Default model for quick spawns (D-M2-7):</p>
      <ModelPicker
        label="Default spawn model"
        value={defaultSpawnModel}
        onChange={(m) => void setDefaultSpawnModel(m)}
      />
    </Section>
  );
}

function Permissions() {
  const [rules, setRules] = useState<PermissionRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .listPermissionRules()
      .then((res) => {
        if (cancelled) return;
        if (res.status === "ok") setRules(res.data);
        else setError(res.error);
      })
      .catch(() => {
        if (!cancelled) setRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(index: number) {
    try {
      const res = await commands.revokePermissionRule(index);
      if (res.status === "ok") setRules(res.data);
      else setError(res.error);
    } catch {
      // keep current list
    }
  }

  return (
    <Section title="Permissions">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {rules === null ? (
        <p className="text-xs text-muted-foreground">Loading rules…</p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-muted-foreground">🔓 No standing allow-rules — every tool asks.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rules.map((r, i) => (
            <li
              key={`${r.agent_id ?? "*"}:${r.tool_pattern}`}
              className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
            >
              <code className="flex-1 font-mono">{r.tool_pattern}</code>
              <span className="text-muted-foreground">{r.agent_id ?? "all agents"}</span>
              <Button
                size="sm"
                variant="outline"
                data-testid={`revoke-rule-${i}`}
                onClick={() => void revoke(i)}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Setup() {
  const [reset, setReset] = useState(false);
  return (
    <Section title="Setup">
      <p className="text-xs text-muted-foreground">
        Walk the first-run wizard again — CLI detection, projects, crew and integrations. It opens in the main
        window.
      </p>
      <div>
        <Button
          size="sm"
          variant="outline"
          data-testid="rerun-wizard"
          onClick={() => {
            // Resets onboarding.state/step; the main window reconciles via
            // SettingChanged (Appendix B) and shows the overlay.
            void import("@/stores/onboarding").then(({ useOnboarding }) => {
              useOnboarding.getState().rerun();
              setReset(true);
            });
          }}
        >
          🧭 Re-run setup wizard
        </Button>
      </div>
      {reset && (
        <p className="text-xs text-muted-foreground" data-testid="rerun-wizard-done">
          ✅ Wizard re-armed — it's waiting in the main window.
        </p>
      )}
    </Section>
  );
}

function ImportFromV1() {
  const [open, setOpen] = useState(false);
  const [dbPath, setDbPath] = useState<string | null>(null);
  return (
    <Section title="Import from v1">
      <p className="text-xs text-muted-foreground">
        One-shot import from a CrewHub v1 database (projects, rooms, agents, tasks, rules, templates,
        blueprints). Dry-run preview first; your v1 file is never written. Safe to re-run.
      </p>
      <div>
        <Button
          size="sm"
          variant="outline"
          data-testid="open-v1-import"
          onClick={() => {
            // best-effort default path from the environment probe
            commands
              .detectEnvironment()
              .then((res) => setDbPath(res.status === "ok" ? res.data.v1_db : null))
              .catch(() => setDbPath(null))
              .finally(() => setOpen(true));
          }}
        >
          📦 Import from CrewHub v1…
        </Button>
      </div>
      {open && <ImportV1Dialog defaultDbPath={dbPath} onClose={() => setOpen(false)} />}
    </Section>
  );
}

function Integrations() {
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  useEffect(() => {
    commands
      .mcpStatus()
      .then((res) => {
        if (res.status === "ok") setMcp(res.data);
      })
      .catch(() => setMcp(null));
  }, []);
  return (
    <Section title="Integrations">
      <p className="text-xs text-muted-foreground">
        MCP server:{" "}
        {mcp ? (
          <code data-testid="mcp-url" className="font-mono">
            {mcp.url}
          </code>
        ) : (
          "not reachable"
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        Enable/disable MCP per project from the project's context menu (M1 install flow).
      </p>
    </Section>
  );
}

export default function SettingsPanel() {
  // Inside the dedicated window the pop-out button would just focus itself.
  const inSettingsWindow = new URLSearchParams(window.location.search).get("window") === "settings";
  return (
    <div data-testid="settings-panel" className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">⚙️ Settings</h2>
        {!inSettingsWindow && (
          <Button
            size="xs"
            variant="outline"
            data-testid="open-settings-window"
            title="Open settings in its own window"
            onClick={() => void commands.openSettingsWindow().catch(() => undefined)}
          >
            🪟 Open in window
          </Button>
        )}
      </div>
      <Appearance />
      <Models />
      <Permissions />
      <Section title="Notifications">
        <NotificationRulesSection />
      </Section>
      <Integrations />
      <Setup />
      <ImportFromV1 />
    </div>
  );
}
