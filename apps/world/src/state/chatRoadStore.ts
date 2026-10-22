/* The chat road as this page sees it (round 28): the host's health (state/health: `connection.session` `key`, or
   absent) and the page's own probe of road 2, combined by `decideChatRoad` (state/chatRoad, the pure contract) into one
   `ChatRoadView` for every place that speaks of the chat. The probe (state/pageChat, road 2) tells its verdict with
   `rememberPageProbe`; until it has, the probe is `unknown`, so the road is `key` or `none`. */
import { useSyncExternalStore } from "react";
import { chatRoadView, type ChatRoadView, type PageProbe } from "./chatRoad.ts";
import { getHealth, subscribeHealth } from "./health.ts";

let probe: PageProbe = "unknown";
const listeners = new Set<() => void>();

/** The page's probe of road 2 said something: kept for everyone who shows the road. */
export function rememberPageProbe(next: PageProbe): void {
  if (next === probe) return;
  probe = next;
  for (const listener of listeners) listener();
}

export const getPageProbe = (): PageProbe => probe;

export const subscribePageProbe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The page's own origin, the exact value of loops' `CHL_WORLD_ORIGIN` for road 2; empty where there is no window (tests). */
export function pageOrigin(): string {
  return typeof location === "undefined" ? "" : location.origin;
}

/** The road from the last health read and the probe's verdict, as one value with what its words need. */
export function currentChatRoad(): ChatRoadView {
  const health = getHealth();
  return chatRoadView({ hostKeyReadsChat: health?.connection ? health.connection.session?.state === "key" : null, pageProbe: probe, pageOrigin: pageOrigin() });
}

const subscribe = (listener: () => void) => {
  const offHealth = subscribeHealth(listener);
  const offProbe = subscribePageProbe(listener);
  return () => {
    offHealth();
    offProbe();
  };
};

let last: ChatRoadView | null = null;
/** The same object while nothing changed, so React does not re-render for an equal road. */
function snapshot(): ChatRoadView {
  const next = currentChatRoad();
  if (last !== null && last.road === next.road && last.hostKeyReadsChat === next.hostKeyReadsChat && last.pageProbe === next.pageProbe && last.pageOrigin === next.pageOrigin) return last;
  last = next;
  return next;
}

/** The chat road for this page, live: the health store and the probe's verdict. */
export function useChatRoad(): ChatRoadView {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
