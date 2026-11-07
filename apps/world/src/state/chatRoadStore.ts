/* The chat road as this page sees it (round 28): the host's health (state/health: `connection.session` `key`, or
   absent) and the page's own probe of road 2 (the chat stores' `probe`), combined by `decideChatRoad` (state/chatRoad, the
   pure contract) into one `ChatRoadView` for every place that speaks of the chat. Until the probe has said something it
   is `unknown`, so the road is `key` or `none`. The page's reader and `useChatRoad` are in state/runtimes.ts. */
import { chatRoadView, hostKeyReadsChatOf, type ChatRoadView } from "./chatRoad.ts";
import type { ChatStores } from "./chatStores.ts";

/** The page's own origin, the exact value of loops' `CHL_WORLD_ORIGIN` for road 2; empty where there is no window (tests). */
function pageOrigin(): string {
  return typeof location === "undefined" ? "" : location.origin;
}

export interface ChatRoadReader {
  subscribe(listener: () => void): () => void;
  /** The road now: the same object while nothing changed, so React does not re-render for an equal road. */
  read(): ChatRoadView;
}

export function chatRoadReader(
  stores: Pick<ChatStores, "probe" | "subscribe">,
  health: { get(): Parameters<typeof hostKeyReadsChatOf>[0]; subscribe(listener: () => void): () => void },
  origin: () => string = pageOrigin,
): ChatRoadReader {
  let last: ChatRoadView | null = null;
  return {
    subscribe(listener) {
      const offHealth = health.subscribe(listener);
      const offStores = stores.subscribe(listener);
      return () => {
        offHealth();
        offStores();
      };
    },
    read() {
      const next = chatRoadView({ hostKeyReadsChat: hostKeyReadsChatOf(health.get()), pageProbe: stores.probe.get(), pageOrigin: origin() });
      if (last !== null && last.road === next.road && last.hostKeyReadsChat === next.hostKeyReadsChat && last.pageProbe === next.pageProbe && last.pageOrigin === next.pageOrigin) return last;
      last = next;
      return next;
    },
  };
}
