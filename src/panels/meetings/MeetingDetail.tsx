// One meeting, opened (T10/T11): live meetings render the Round Table (turns
// fold refreshes on every MeetingChanged through the store); terminal meetings
// render the output + action items. Completion fires the Gavel-Drop confetti
// (reuses the M2 burst, ≤1 s, reduced-motion: skipped inside ConfettiBurst).
import { useEffect, useRef, useState } from "react";
import type { Meeting } from "@/ipc/bindings";
import { ConfettiBurst } from "@/panels/crew/ConfettiBurst";
import { isTerminalState, useMeetingsStore } from "@/stores/meetings";
import { useTasksStore } from "@/stores/tasks";
import { ActionItemsList } from "./ActionItemsList";
import { MeetingOutput } from "./MeetingOutput";
import { RoundTable } from "./RoundTable";

export interface MeetingDetailProps {
  meeting: Meeting;
  onError: (msg: string) => void;
}

export function MeetingDetail({ meeting, onError }: MeetingDetailProps) {
  const turns = useMeetingsStore((s) => s.turns.get(meeting.id)) ?? [];
  const items = useMeetingsStore((s) => s.actionItems.get(meeting.id)) ?? [];
  const [celebrate, setCelebrate] = useState(false);
  const prevState = useRef(meeting.state);

  useEffect(() => {
    void useMeetingsStore.getState().loadTurns(meeting.id);
    if (meeting.state === "complete") {
      void useMeetingsStore.getState().loadActionItems(meeting.id);
      // The board task IPC backs "execute"/deep-links — warm the store.
      void useTasksStore.getState().init();
    }
  }, [meeting.id, meeting.state]);

  // Gavel falls, meeting completes → one confetti burst (only on a live
  // transition, never when merely opening an already-finished meeting).
  useEffect(() => {
    if (prevState.current !== "complete" && meeting.state === "complete") setCelebrate(true);
    prevState.current = meeting.state;
  }, [meeting.state]);

  const cancel = async () => {
    const err = await useMeetingsStore.getState().cancel(meeting.id);
    if (err) onError(`couldn't cancel — ${err}`);
  };

  const terminal = isTerminalState(meeting.state);

  return (
    <div className="relative flex flex-col gap-3" data-testid={`meeting-detail-${meeting.id}`}>
      <div>
        <h2 className="text-sm font-semibold">{meeting.title}</h2>
        {meeting.goal && <p className="text-xs text-muted-foreground">🎯 {meeting.goal}</p>}
      </div>

      {terminal ? (
        <>
          <MeetingOutput meeting={meeting} turns={turns} />
          {meeting.state === "complete" && (
            <ActionItemsList meeting={meeting} items={items} onError={onError} />
          )}
        </>
      ) : (
        <RoundTable meeting={meeting} turns={turns} onCancel={() => void cancel()} />
      )}

      {celebrate && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
          <ConfettiBurst onDone={() => setCelebrate(false)} />
        </div>
      )}
    </div>
  );
}
