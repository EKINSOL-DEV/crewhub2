// Meeting output view (T11, EKI-14 part 2): `output_md` through the shared
// Markdown renderer, per-turn drill-down via transcript offsets (TurnExcerpt —
// never copied text), and honest terminal states: a cancelled/errored meeting
// says "⚠️ ended early — here's what we had" instead of pretending.
import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import type { Meeting, MeetingTurn } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { parseMeetingConfig, resolveTurnSession, turnChip } from "@/stores/meetings";
import { useSessionsStore } from "@/stores/sessions";
import { TurnExcerpt } from "./TurnExcerpt";

const CHIPS: Record<string, string> = { done: "✅", skipped: "💤", active: "🎙️", pending: "·" };

export interface MeetingOutputProps {
  meeting: Meeting;
  turns: MeetingTurn[];
}

export function MeetingOutput({ meeting, turns }: MeetingOutputProps) {
  const agents = useAgentsStore((s) => s.agents);
  const sessions = useSessionsStore((s) => s.sessions);
  const [openTurnId, setOpenTurnId] = useState<string | null>(null);

  const cfg = parseMeetingConfig(meeting.config_json);
  const metaList = Object.values(sessions);
  const endedEarly = meeting.state === "cancelled" || meeting.state === "error";

  const nameOf = (agentId: string) =>
    cfg.participants.find((p) => p.agent_id === agentId)?.name ??
    agents.find((a) => a.id === agentId)?.name ??
    agentId;

  const rounds = [...new Set(turns.map((t) => t.round_num))].sort((a, b) => a - b);
  const openTurn = openTurnId ? (turns.find((t) => t.id === openTurnId) ?? null) : null;

  return (
    <div className="flex flex-col gap-3" data-testid="meeting-output">
      {endedEarly && (
        <div
          data-testid="ended-early"
          className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs"
        >
          ⚠️ ended early — here's what we had.
          {meeting.error_message && <span className="text-destructive"> {meeting.error_message}</span>}
        </div>
      )}

      {meeting.output_md ? (
        <div className="rounded border p-3" data-testid="output-md">
          <Markdown text={meeting.output_md} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="no-output">
          {endedEarly
            ? "no synthesis was written — the turns below are all there is"
            : "no output yet — synthesis hasn't run"}
        </p>
      )}

      {turns.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="turn-drilldown">
          <h3 className="text-xs font-semibold">🎙️ Turns</h3>
          {rounds.map((round) => (
            <div key={round} className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">
                {round === 0 ? "Gathering" : `Round ${round}`}
              </span>
              {turns
                .filter((t) => t.round_num === round)
                .sort((a, b) => a.turn_index - b.turn_index)
                .map((t) => {
                  const chip = turnChip(t, meeting);
                  return (
                    <div key={t.id} className="flex flex-col">
                      <button
                        type="button"
                        data-testid={`drill-turn-${t.id}`}
                        disabled={!t.session_id}
                        className="flex items-center gap-2 rounded border px-2 py-1 text-left text-xs hover:bg-muted disabled:opacity-50"
                        onClick={() => setOpenTurnId(openTurnId === t.id ? null : t.id)}
                      >
                        <span aria-hidden>{CHIPS[chip]}</span>
                        <span className="min-w-0 flex-1 truncate">{nameOf(t.agent_id)}</span>
                        {chip === "skipped" && (
                          <span className="text-[10px] text-muted-foreground">
                            💤 skipped — timed out after one retry
                          </span>
                        )}
                      </button>
                      {openTurn?.id === t.id && (
                        <TurnExcerpt
                          key={t.id}
                          turn={t}
                          session={resolveTurnSession(t.session_id, metaList)}
                          historyMode
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
