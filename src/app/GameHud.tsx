// Game HUD (EKI-121): the chrome a management game would give you — a status
// strip up top (crew at a glance, click-through to sessions) and a dock of
// chunky emoji buttons along the bottom that toggle panel drawers. The 3D
// world is the stage; this is the HUD painted over it.
import { useMemo } from "react";
import { useSessionsView } from "@/stores/sessions";
import type { PanelKind } from "./layout-tree";
import { PANELS } from "./panel-registry";
import { useOverlays } from "./overlays";

/** The dock lineup — every entry is a registered panel; digit N toggles it. */
export const DOCK: PanelKind[] = [
  "sessions",
  "board",
  "crew",
  "projects",
  "activity",
  "meetings",
  "automation",
  "settings",
];

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function WorldHudStrip() {
  const views = useSessionsView();
  const stats = useMemo(() => {
    let working = 0;
    let waiting = 0;
    let idle = 0;
    let tokens = 0;
    for (const v of views) {
      if (v.meta.status === "Working") working++;
      else if (v.meta.status === "WaitingForPermission" || v.meta.status === "WaitingForInput") waiting++;
      else if (v.meta.status === "Idle") idle++;
      tokens += v.meta.usage.input_tokens + v.meta.usage.output_tokens;
    }
    return { working, waiting, idle, tokens };
  }, [views]);

  return (
    <button
      type="button"
      data-testid="hud-strip"
      title="Sessions overview"
      onClick={() => useOverlays.getState().toggle("sessions")}
      className="pointer-events-auto absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-card/85 px-4 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition-transform hover:scale-105"
    >
      <span title="Working">🟢 {stats.working}</span>
      <span title="Needs you" className={stats.waiting > 0 ? "animate-pulse" : ""}>
        🙋 {stats.waiting}
      </span>
      <span title="Idle">😴 {stats.idle}</span>
      <span className="text-muted-foreground" title="Tokens this session">
        ⚡ {fmtTokens(stats.tokens)}
      </span>
    </button>
  );
}

export function WorldDock() {
  const active = useOverlays((s) => s.overlay?.kind ?? null);
  const views = useSessionsView();
  const waiting = views.filter(
    (v) => v.meta.status === "WaitingForPermission" || v.meta.status === "WaitingForInput",
  ).length;

  return (
    <div
      data-testid="hud-dock"
      className="pointer-events-auto absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-end gap-1.5 rounded-full border bg-card/85 px-2.5 py-1.5 shadow-lg backdrop-blur"
    >
      {DOCK.map((kind, i) => {
        const def = PANELS[kind];
        const isActive = active === kind;
        const badge = kind === "sessions" ? waiting : 0;
        return (
          <button
            key={kind}
            type="button"
            aria-label={`${def.label} panel`}
            data-testid={`dock-${kind}`}
            onClick={() => useOverlays.getState().toggle(kind)}
            className={`group relative flex h-10 w-10 items-center justify-center rounded-full text-xl transition-transform hover:-translate-y-1 hover:scale-110 active:scale-95 ${
              isActive ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-muted"
            }`}
          >
            {def.emoji}
            {/* Hover label with its digit shortcut — management-game tooltips. */}
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 scale-75 whitespace-nowrap rounded-full border bg-card px-2.5 py-1 text-[10px] font-semibold opacity-0 shadow-lg transition-all group-hover:scale-100 group-hover:opacity-100">
              {def.label} · {i + 1}
            </span>
            {badge > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
