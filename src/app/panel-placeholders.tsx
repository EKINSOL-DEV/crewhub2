// Lane B/C panel placeholders: each renders its registry "Quiet Office" empty
// state until the owning lane lands the real panel (M2 build-order contract).
// Keep each placeholder tiny — the real panel replaces the lazy import only.
import { EmptyState } from "@/components/EmptyState";
import type { PanelKind } from "./layout-tree";
import { PANELS } from "./panel-registry";

function QuietOffice({ kind }: { kind: PanelKind }) {
  return <EmptyState {...PANELS[kind].emptyState} />;
}

export function ChatPlaceholder() {
  return <QuietOffice kind="chat" />;
}

export function SessionsPlaceholder() {
  return <QuietOffice kind="sessions" />;
}

export function ActivityPlaceholder() {
  return <QuietOffice kind="activity" />;
}

export function HistoryPlaceholder() {
  return <QuietOffice kind="history" />;
}

export function CrewPlaceholder() {
  return <QuietOffice kind="crew" />;
}
