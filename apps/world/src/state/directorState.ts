/* What the director runtime publishes (state/director.ts), and when it is new. Pure, so a node test can pin it. */
import type { FeedUsage, PlanRecord } from "@crewhub/demo";
import type { PresenceSettings, WorldModel } from "@crewhub/world-model";

export interface DirectorState {
  settings: PresenceSettings;
  /** The mode of the last model seen, which decides which switch counts; "demo" before the first model. */
  mode: WorldModel["mode"];
  /** Whether the feed runs now: the switch of the current mode (`effectivePresence`). */
  enabled: boolean;
  /** Newest first. */
  plans: readonly PlanRecord[];
  usage: FeedUsage;
}

/** Nothing to publish: the same settings, mode, switch and plans (by identity) and the same usage (by value). */
export function sameDirectorState(prev: DirectorState, next: DirectorState): boolean {
  return prev.settings === next.settings && prev.mode === next.mode && prev.enabled === next.enabled && prev.plans === next.plans && JSON.stringify(prev.usage) === JSON.stringify(next.usage);
}
