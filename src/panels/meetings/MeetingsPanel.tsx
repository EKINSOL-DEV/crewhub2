// Meetings panel (Lane G, T10/T11 — EKI-14): history browser + start dialog +
// the Round Table live view, all folded from the meetings store (seed +
// MeetingChanged reconcile). Quiet Orchestra empty state per D-M4-10.
import "./meetings.css";
import { useEffect, useMemo, useState } from "react";
import type { PanelProps } from "@/app/panel-registry";
import { useProjectFilter } from "@/app/project-filter";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import type { Meeting } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import {
  formatDuration,
  isTerminalState,
  meetingDurationMs,
  meetingMatchesFilter,
  meetingStateBadge,
  parseMeetingConfig,
  sortMeetings,
  useMeetingsStore,
  useStandupsStore,
} from "@/stores/meetings";
import { useProjectsStore } from "@/stores/projects";
import { useRoomsStore } from "@/stores/rooms";
import { useSessionsStore } from "@/stores/sessions";
import { MeetingDetail } from "./MeetingDetail";
import { StandupView } from "./StandupView";
import { StartMeetingDialog } from "./StartMeetingDialog";

function MeetingRow({ meeting, onOpen }: { meeting: Meeting; onOpen: (id: string) => void }) {
  const badge = meetingStateBadge(meeting.state);
  const cfg = parseMeetingConfig(meeting.config_json);
  const duration = meetingDurationMs(meeting);
  const started = meeting.started_at ? new Date(meeting.started_at).toLocaleString() : "—";
  return (
    <button
      type="button"
      data-testid={`meeting-row-${meeting.id}`}
      className="flex w-full items-center gap-2 rounded border bg-card px-2 py-1.5 text-left text-xs hover:bg-muted"
      onClick={() => onOpen(meeting.id)}
    >
      <span data-testid={`meeting-state-${meeting.id}`} title={badge.label}>
        {badge.emoji}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{meeting.title}</span>
      <span className="text-muted-foreground">
        👥 {cfg.participants.length} · {duration !== null ? formatDuration(duration) : badge.label}
      </span>
      <span className="text-[10px] text-muted-foreground">{started}</span>
    </button>
  );
}

export default function MeetingsPanel({ params, setParams }: PanelProps) {
  const meetings = useMeetingsStore((s) => s.meetings);
  const loaded = useMeetingsStore((s) => s.loaded);
  const rooms = useRoomsStore((s) => s.rooms);
  const { projectId, projects } = useProjectFilter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void useMeetingsStore.getState().init();
    void useStandupsStore.getState().init();
    void useAgentsStore.getState().init();
    void useRoomsStore.getState().load();
    void useSessionsStore.getState().init();
    void useProjectsStore.getState().load();
  }, []);

  const setParam = (key: string, value: string | null) => {
    const next = { ...params };
    if (value) next[key] = value;
    else delete next[key];
    setParams(next);
  };

  const view = params.view === "standups" ? "standups" : "meetings";
  const roomFilter = params.room || null;
  const projFilter = params.project || projectId || null;

  const filtered = useMemo(
    () =>
      sortMeetings(
        [...meetings.values()].filter((m) =>
          meetingMatchesFilter(m, { roomId: roomFilter, projectId: projFilter }),
        ),
      ),
    [meetings, roomFilter, projFilter],
  );

  const openMeeting = params.meeting ? (meetings.get(params.meeting) ?? null) : null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="meetings-panel">
      <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-xs">
        <button
          type="button"
          data-testid="tab-meetings"
          aria-pressed={view === "meetings"}
          className={`rounded-full border px-2 py-0.5 ${view === "meetings" ? "border-ring bg-muted font-medium" : "text-muted-foreground"}`}
          onClick={() => setParam("view", null)}
        >
          🎻 Meetings
        </button>
        <button
          type="button"
          data-testid="tab-standups"
          aria-pressed={view === "standups"}
          className={`rounded-full border px-2 py-0.5 ${view === "standups" ? "border-ring bg-muted font-medium" : "text-muted-foreground"}`}
          onClick={() => setParam("view", "standups")}
        >
          ☕ Standups
        </button>
        <span className="flex-1" />
        {view === "meetings" && !openMeeting && (
          <>
            <label className="flex items-center gap-1">
              room
              <select
                aria-label="Room filter"
                className="rounded border bg-background px-1 py-0.5 text-xs"
                value={params.room ?? ""}
                onChange={(e) => setParam("room", e.target.value || null)}
              >
                <option value="">all</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.icon ?? "🚪"} {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              project
              <select
                aria-label="Project filter"
                className="rounded border bg-background px-1 py-0.5 text-xs"
                value={params.project ?? ""}
                onChange={(e) => setParam("project", e.target.value || null)}
              >
                <option value="">{projectId ? "tab filter" : "all"}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon ?? "📁"} {p.name}
                  </option>
                ))}
              </select>
            </label>
            <Button size="xs" data-testid="start-meeting" onClick={() => setStarting(true)}>
              🎬 Start meeting
            </Button>
          </>
        )}
        {openMeeting && (
          <Button
            size="xs"
            variant="ghost"
            data-testid="back-to-list"
            onClick={() => setParam("meeting", null)}
          >
            ← all meetings
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto p-2">
        {view === "standups" ? (
          <StandupView onError={setError} />
        ) : openMeeting ? (
          <MeetingDetail meeting={openMeeting} onError={setError} />
        ) : loaded && filtered.length === 0 ? (
          <EmptyState
            emoji="🎻"
            title="No meetings yet"
            hint="🎻 no meetings yet — gather the crew"
            action={
              <Button size="xs" data-testid="empty-start-meeting" onClick={() => setStarting(true)}>
                🎬 Start meeting
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-1.5" data-testid="meetings-list">
            {filtered.map((m) => (
              <MeetingRow key={m.id} meeting={m} onOpen={(id) => setParam("meeting", id)} />
            ))}
          </div>
        )}

        {starting && (
          <StartMeetingDialog
            defaultRoomId={roomFilter}
            defaultProjectId={projFilter}
            onClose={() => setStarting(false)}
            onStarted={(m) => {
              setStarting(false);
              setParam("meeting", m.id);
              // The live view folds MeetingChanged from here on; terminal
              // meetings render the output instead (MeetingDetail decides).
              if (!isTerminalState(m.state)) void useMeetingsStore.getState().loadTurns(m.id);
            }}
          />
        )}
      </div>
    </div>
  );
}
