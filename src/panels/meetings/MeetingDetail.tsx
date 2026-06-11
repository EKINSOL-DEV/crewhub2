// One meeting, opened (T10/T11): live meetings render the Round Table; the
// turns fold refreshes on every MeetingChanged through the store.
import { useEffect } from "react";
import type { Meeting } from "@/ipc/bindings";
import { Markdown } from "@/components/Markdown";
import { isTerminalState, useMeetingsStore } from "@/stores/meetings";
import { RoundTable } from "./RoundTable";

export interface MeetingDetailProps {
  meeting: Meeting;
  onError: (msg: string) => void;
}

export function MeetingDetail({ meeting, onError }: MeetingDetailProps) {
  const turns = useMeetingsStore((s) => s.turns.get(meeting.id)) ?? [];

  useEffect(() => {
    void useMeetingsStore.getState().loadTurns(meeting.id);
    if (meeting.state === "complete") void useMeetingsStore.getState().loadActionItems(meeting.id);
  }, [meeting.id, meeting.state]);

  const cancel = async () => {
    const err = await useMeetingsStore.getState().cancel(meeting.id);
    if (err) onError(`couldn't cancel — ${err}`);
  };

  return (
    <div className="flex flex-col gap-3" data-testid={`meeting-detail-${meeting.id}`}>
      <div>
        <h2 className="text-sm font-semibold">{meeting.title}</h2>
        {meeting.goal && <p className="text-xs text-muted-foreground">🎯 {meeting.goal}</p>}
      </div>

      <RoundTable meeting={meeting} turns={turns} onCancel={() => void cancel()} />

      {isTerminalState(meeting.state) && meeting.output_md && (
        <div className="rounded border p-3" data-testid="meeting-output">
          <Markdown text={meeting.output_md} />
        </div>
      )}
    </div>
  );
}
