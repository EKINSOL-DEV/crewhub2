/* The words of the first-snapshot line (components/FirstSnapshot.tsx), pure: the host's `connection.snapshot` in. */
import type { HostSnapshotState } from "@crewhub/loops-client";

/** The app's `translate`, passed in: this module stays loadable without the i18n table (Node tests). */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The line for the host's snapshot state; an older host (no state) or an idle one is "Connecting to the world's host…". */
export function firstSnapshotWords(snapshot: HostSnapshotState | null | undefined, translate: Translate): string {
  if (!snapshot || snapshot.state === "idle") return translate("world.firstSnapshot.connecting");
  if (snapshot.state === "reading") {
    if (snapshot.projects === undefined) return translate("world.firstSnapshot.listing");
    return translate("world.firstSnapshot.reading", { count: snapshot.projects, projects: translate(snapshot.projects === 1 ? "world.firstSnapshot.project" : "world.firstSnapshot.projects"), reads: snapshot.reads });
  }
  if (snapshot.state === "ready") return translate("world.firstSnapshot.ready", { count: snapshot.projects, projects: translate(snapshot.projects === 1 ? "world.firstSnapshot.project" : "world.firstSnapshot.projects") });
  return translate("world.firstSnapshot.failed", { reason: snapshot.reason });
}
