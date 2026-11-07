/* The quiet line in the stage while the live source loads its first snapshot: "Reading 12 projects from
   crewhub-loops…". App shows it while the connection is `connecting` (live mode, no snapshot yet); it holds the host
   health's `snapshot` need (state/health.ts: a read every 0.5 s) for `connection.snapshot` (the host's progress: the
   project count once the list is in, the reads done). One small component in the muted status style of "Laying out the
   town…"; the words are a pure function. */
import { Sprout } from "lucide-react";
import { translate } from "../i18n";
import { firstSnapshotWords } from "../state/firstSnapshot";
import { snapshotProgress, useHealthNeed, useHealthView } from "../state/health";

export function FirstSnapshot() {
  useHealthNeed("snapshot");
  const snapshot = snapshotProgress(useHealthView().read);
  return (
    <div className="room-loading first-snapshot" role="status" aria-live="polite" data-snapshot={snapshot?.state ?? "unknown"}>
      <Sprout size={28} aria-hidden="true" />
      {firstSnapshotWords(snapshot, translate)}
    </div>
  );
}
