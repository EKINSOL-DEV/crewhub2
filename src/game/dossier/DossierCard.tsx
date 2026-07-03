// Bot dossier card (M9 T2): the "who is this bot, really" panel. Styled like
// HireDialog/HqCard (chunky white/slate game-card look) but positioned and
// dragged like ChatWindow — a floating panel anchored center-right by
// default, not a centered modal over a blurred backdrop — so it can sit
// alongside an open chat window instead of blacking out the world behind
// it. Reached from a ChatWindow header's ℹ️ button and from HqCard's roster
// rows, both of which just call `useBuildMode.getState().openRoomCard({
// kind: "dossier", key })` — the single-open card slot mode.ts already
// enforces (see its own doc comment) does the rest, including closing this
// card when anything else opens.
//
// Data comes from `buildDossier` (data.ts, M9 T1) — this file only wires
// that pure join to the live stores (useDossier below) and renders the
// result; the bio text comes from useBios (bio.ts, M9 T1), also read-only
// from this file's perspective.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { playSfx } from "@/game/audio/sfx";
import { useBuildMode } from "@/game/build/mode";
import { useGameChats } from "@/game/chat/store";
import { useDragPosition, type DragPoint } from "@/game/chat/use-drag-position";
import { useCameraDirector } from "@/game/engine/camera/director";
import type { SessionStatus } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsStore } from "@/stores/sessions";
import { BIO_DISABLED_PLACEHOLDER, useBios } from "./bio";
import { abbrevTokens, buildDossier, humanizeDuration, type DossierInfo } from "./data";

const STATUS_LABEL: Record<SessionStatus | "resting", string> = {
  Working: "🟢 Working",
  WaitingForPermission: "🔴 Needs permission",
  WaitingForInput: "🟠 Waiting for input",
  Idle: "⚪ Idle",
  Ended: "⚪ Ended",
  resting: "😴 Resting",
};

/**
 * Mirrors bio.ts's own (private) `stableKey`: the underlying crew agent's id
 * when one is bound, else the dossier's own key. Duplicated rather than
 * exported — bio.ts isn't part of this task's file list, and it's two lines.
 */
function bioKeyFor(info: DossierInfo): string {
  return info.agentId ? `agent:${info.agentId}` : info.key;
}

/** Joins the live stores into one DossierInfo (the store-wiring half of
 *  data.ts's pure join) plus the "captured once at mount" nowMs every other
 *  card in this game uses (HireDialog/RoomCard/HqCard) for the same reason:
 *  a short-lived card can drift a little on "how long has this been true"
 *  without needing a ticking clock. */
function useDossier(key: string): { info: DossierInfo | null; nowMs: number } {
  const sessions = useSessionsStore((s) => s.sessions);
  const bindings = useBindingsStore((s) => s.bindings);
  const rooms = useBindingsStore((s) => s.rooms);
  const agents = useAgentsStore((s) => s.agents);
  const projects = useProjectsStore((s) => s.projects);
  const [nowMs] = useState(() => Date.now());
  const info = useMemo(
    () => buildDossier(key, { sessions, bindings, agents, rooms, projects, nowMs }),
    [key, sessions, bindings, agents, rooms, projects, nowMs],
  );
  return { info, nowMs };
}

interface InfoRow {
  label: string;
  value: string;
  subtitle?: string | null;
  onClick?: () => void;
}

/** Info grid rows in the brief's order, only the non-null ones. */
function rowsFor(info: DossierInfo, nowMs: number): InfoRow[] {
  const rows: InfoRow[] = [];
  if (info.model) rows.push({ label: "Model", value: info.model });
  if (info.projectName) {
    rows.push({ label: "Project", value: info.projectName, subtitle: info.projectFolder });
  }
  if (info.roomName) rows.push({ label: "Room", value: info.roomName });
  if (info.gitBranch) rows.push({ label: "Branch", value: info.gitBranch });
  if (info.activity) rows.push({ label: "Activity", value: info.activity });
  if (info.usage) {
    rows.push({
      label: "Usage",
      value: `${abbrevTokens(info.usage.inputTokens)} in · ${abbrevTokens(info.usage.outputTokens)} out`,
    });
  }
  if (info.origin) rows.push({ label: "Origin", value: info.origin });
  const parentKey = info.parentKey;
  if (parentKey) {
    rows.push({
      label: "Forked from",
      value: parentKey,
      onClick: () => useBuildMode.getState().openRoomCard({ kind: "dossier", key: parentKey }),
    });
  }
  if (info.agentRole) rows.push({ label: "Crew role", value: info.agentRole });
  if (info.motion) rows.push({ label: "Currently", value: info.motion });
  if (info.statusSinceMs !== null) {
    rows.push({ label: "Status since", value: `${humanizeDuration(nowMs - info.statusSinceMs)} ago` });
  }
  return rows;
}

export interface DossierCardProps {
  dossierKey: string;
  onClose: () => void;
}

export function DossierCard({ dossierKey, onClose }: DossierCardProps) {
  const { info, nowMs } = useDossier(dossierKey);
  const bios = useBios((s) => s.bios);
  const loading = useBios((s) => s.loading);
  const ensure = useBios((s) => s.ensure);
  const regenerate = useBios((s) => s.regenerate);
  const container = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<DragPoint | null>(null);
  const drag = useDragPosition({ containerRef: container, pos, onChange: setPos });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Fired on mount and whenever the resolved key changes (e.g. a "Forked
  // from" click remounts this component fresh via GameShell's `key` prop,
  // but the effect dep is kept narrow/scalar rather than the whole `info`
  // object, which is a fresh reference every render).
  useEffect(() => {
    if (info) ensure(info);
  }, [info?.key, ensure]); // eslint-disable-line react-hooks/exhaustive-deps -- `info` itself is intentionally not a dep (see comment)

  if (!info) return null;

  const bioKey = bioKeyFor(info);
  const cached = bios[bioKey];
  const bioText = cached === undefined ? "🤖 …" : cached === BIO_DISABLED_PLACEHOLDER ? "—" : cached;

  const style: CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { top: "50%", right: 16, transform: "translateY(-50%)" };

  return (
    <div
      ref={container}
      data-testid="dossier-card"
      className="pointer-events-auto absolute flex max-h-[70vh] w-[380px] flex-col rounded-3xl border-2 border-white/60 bg-white/90 text-slate-900 shadow-2xl backdrop-blur"
      style={style}
    >
      <div
        data-testid="dossier-card-header"
        className="flex cursor-grab items-center gap-2 rounded-t-3xl border-b-2 border-slate-900/10 px-4 py-3 active:cursor-grabbing"
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerUp}
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
        <span className="min-w-0 flex-1 truncate font-bold">{info.name}</span>
        <span
          data-testid="dossier-card-status"
          className="shrink-0 rounded-full bg-slate-900/5 px-2 py-0.5 text-xs"
        >
          {STATUS_LABEL[info.status]}
        </span>
        <button
          type="button"
          aria-label="Close"
          className="rounded-full px-1.5 py-0.5 font-bold hover:bg-slate-900/10"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="flex items-start gap-2 border-b-2 border-slate-900/10 px-4 py-3">
        <p data-testid="dossier-card-bio" className="min-w-0 flex-1 text-sm text-slate-600 italic">
          {bioText}
        </p>
        <button
          type="button"
          aria-label="Regenerate bio"
          data-testid="dossier-card-bio-regenerate"
          disabled={loading !== null}
          onClick={() => regenerate(info)}
          className="shrink-0 rounded-full px-1.5 py-0.5 hover:bg-slate-900/10 disabled:opacity-50"
        >
          🔄
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="dossier-card-grid">
        {rowsFor(info, nowMs).map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 py-1 text-sm">
            <span className="shrink-0 text-slate-500">{row.label}</span>
            {row.onClick ? (
              <button
                type="button"
                data-testid={`dossier-card-row-${row.label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={row.onClick}
                className="min-w-0 flex-1 truncate text-right font-medium text-sky-700 hover:underline"
              >
                {row.value}
              </button>
            ) : (
              <span className="min-w-0 flex-1 text-right">
                <span className="block truncate font-medium">{row.value}</span>
                {row.subtitle && (
                  <span className="block truncate text-xs text-slate-500">{row.subtitle}</span>
                )}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-t-2 border-slate-900/10 p-2">
        <button
          type="button"
          data-testid="dossier-card-chat"
          onClick={() => useGameChats.getState().open(info.key)}
          className="flex-1 rounded-full border-2 border-slate-900/10 px-3 py-1.5 text-sm font-medium hover:bg-slate-900/5"
        >
          💬 Chat
        </button>
        <button
          type="button"
          data-testid="dossier-card-follow"
          onClick={() => {
            useCameraDirector.getState().followBot(info.key);
            playSfx("click");
          }}
          className="flex-1 rounded-full border-2 border-slate-900/10 px-3 py-1.5 text-sm font-medium hover:bg-slate-900/5"
        >
          🎥 Follow
        </button>
      </div>
    </div>
  );
}
