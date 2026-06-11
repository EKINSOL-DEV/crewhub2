// Round Table live view (T10, EKI-14 — D-M4-10's first named touch):
// participants seated in an arc, the active speaker pulses with typing dots
// (reduced-motion: static highlight), finished turns get ✅, skipped turns the
// sleepy 💤 (Lane 0 contract: completed_at NULL + meeting moved past), the
// synthesis stage taps the gavel. Turn text is read on demand via transcript
// offsets — never copied (TurnExcerpt).
import "./meetings.css";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import type { Meeting, MeetingTurn } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import {
  isTerminalState,
  meetingPosition,
  parseMeetingConfig,
  resolveTurnSession,
  roundLabel,
  turnAt,
  turnChip,
  type TurnChip,
} from "@/stores/meetings";
import { useSessionsStore } from "@/stores/sessions";
import { TurnExcerpt } from "./TurnExcerpt";

const CHIP_GLYPHS: Record<TurnChip, string> = {
  done: "✅",
  active: "🎙️",
  skipped: "💤",
  pending: "·",
};

const CHIP_TITLES: Record<TurnChip, string> = {
  done: "turn finished",
  active: "speaking now",
  skipped: "skipped — timeout after one retry (a missing voice beats a dead meeting)",
  pending: "not yet",
};

function roundName(round: number, rounds: number): string {
  return round === 0 ? "Gathering" : `Round ${round} of ${rounds}`;
}

/** Seat coordinates along the far arc of the table (pure — also unit-testable). */
export function seatPosition(index: number, count: number): { leftPct: number; topPct: number } {
  const t = count <= 1 ? 0.5 : (index + 0.5) / count;
  const angle = Math.PI * (1 - t); // PI → 0 left-to-right across the arc
  return {
    leftPct: 50 + 42 * Math.cos(angle),
    topPct: 64 - 48 * Math.sin(angle),
  };
}

export interface RoundTableProps {
  meeting: Meeting;
  turns: MeetingTurn[];
  onCancel: () => void;
}

export function RoundTable({ meeting, turns, onCancel }: RoundTableProps) {
  const reduced = usePrefersReducedMotion();
  const agents = useAgentsStore((s) => s.agents);
  const sessions = useSessionsStore((s) => s.sessions);
  const [openTurnId, setOpenTurnId] = useState<string | null>(null);

  const cfg = parseMeetingConfig(meeting.config_json);
  const pos = meetingPosition(meeting);
  const live = !isTerminalState(meeting.state);
  const speaking = meeting.state === "gathering" || meeting.state === "round";
  const metaList = Object.values(sessions);

  const agentIcon = (agentId: string) => agents.find((a) => a.id === agentId)?.icon ?? "🤖";

  const allRounds = Array.from({ length: cfg.rounds + 1 }, (_, r) => r);
  const openTurn = openTurnId ? (turns.find((t) => t.id === openTurnId) ?? null) : null;

  return (
    <div data-testid="round-table" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span data-testid="round-indicator" className="text-sm font-medium">
          {meeting.state === "synthesis" ? (
            <>
              <span className={reduced ? undefined : "gavel-drop"} data-testid="gavel" aria-hidden>
                {reduced ? "🔨" : "⚖️"}
              </span>{" "}
              Synthesis — the scribe is writing
            </>
          ) : (
            roundLabel(meeting, cfg.rounds)
          )}
        </span>
        <span className="flex-1" />
        {live && (
          <Button size="xs" variant="outline" data-testid="cancel-meeting" onClick={onCancel}>
            🛑 Cancel meeting
          </Button>
        )}
      </div>

      {/* the table itself */}
      <div className="round-table" data-reduced-motion={reduced || undefined}>
        <div className="round-table-surface" aria-hidden />
        {cfg.participants.map((p, i) => {
          const { leftPct, topPct } = seatPosition(i, cfg.participants.length);
          const active = live && speaking && pos.turn === i;
          return (
            <div
              key={p.agent_id}
              data-testid={`seat-${p.agent_id}`}
              data-active={active}
              className="round-table-seat"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            >
              <span className="round-table-avatar" aria-hidden>
                {agentIcon(p.agent_id)}
              </span>
              <span className="max-w-full truncate text-[10px]">{p.name}</span>
              {active &&
                (reduced ? (
                  <span data-testid="speaking-static" className="text-[9px] text-muted-foreground">
                    speaking
                  </span>
                ) : (
                  <span className="typing-dots text-foreground" data-testid="typing-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                ))}
            </div>
          );
        })}
      </div>

      {/* per-turn chips: rows = gathering + rounds, cols = participants */}
      <div className="flex flex-col gap-1 text-xs" data-testid="turn-grid">
        {allRounds.map((round) => (
          <div key={round} className="flex items-center gap-1.5">
            <span className="w-24 shrink-0 text-[10px] text-muted-foreground">
              {roundName(round, cfg.rounds)}
            </span>
            {cfg.participants.map((p, i) => {
              const turn = turnAt(turns, round, i);
              const chip: TurnChip = turn ? turnChip(turn, meeting) : "pending";
              return (
                <button
                  key={p.agent_id}
                  type="button"
                  data-testid={`turn-chip-${round}-${i}`}
                  data-chip={chip}
                  title={`${p.name} — ${CHIP_TITLES[chip]}`}
                  disabled={!turn?.session_id}
                  className="min-w-7 rounded border px-1 py-0.5 disabled:opacity-50"
                  onClick={() => turn && setOpenTurnId(openTurnId === turn.id ? null : turn.id)}
                >
                  {CHIP_GLYPHS[chip]}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {openTurn && (
        <TurnExcerpt
          key={openTurn.id}
          turn={openTurn}
          session={resolveTurnSession(openTurn.session_id, metaList)}
          historyMode={!live}
        />
      )}
    </div>
  );
}
