/* The quiet line in the stage while the live source loads its first snapshot: "Reading 12 projects from
   crewhub-loops…". App shows it while the connection is `connecting` (live mode, no snapshot yet); it asks the host's
   health every `pollMs` for `connection.snapshot` (the host's progress: the project count once the list is in, the reads
   done). One small component in the muted status style of "Laying out the town…"; the words are a pure function. */
import { Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import { type HostSnapshotState, probeHost } from "@crewhub/loops-client";
import { translate } from "../i18n";
import { firstSnapshotWords } from "../state/firstSnapshot";

export function FirstSnapshot({ pollMs = 500 }: { pollMs?: number }) {
  const [snapshot, setSnapshot] = useState<HostSnapshotState | null>(null);
  useEffect(() => {
    let live = true;
    const ask = async () => {
      const health = await probeHost("", 1500);
      if (live) setSnapshot(health?.connection?.snapshot ?? null);
    };
    void ask();
    const timer = setInterval(() => void ask(), pollMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pollMs]);
  return (
    <div className="room-loading first-snapshot" role="status" aria-live="polite" data-snapshot={snapshot?.state ?? "unknown"}>
      <Sprout size={28} aria-hidden="true" />
      {firstSnapshotWords(snapshot, translate)}
    </div>
  );
}
