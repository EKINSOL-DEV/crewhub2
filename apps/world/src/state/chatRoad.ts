/* The chat road the page shows (round 28, the shared contract of r28-session and r28-road2): one value, decided in one
   place. r28-session owns this file (the type, the words and `decideChatRoad`); this is r28-road2's STUB of the contract,
   exactly its shape, so the page's own road (state/pageChat.ts) can import it until feat/world-demo carries the real one,
   which replaces this file whole at the merge.
   - `key`: the host reads the chat with the viewer key (health `connection.session.state === "key"`);
   - `page`: the page reads loops itself (road 2), decided by the page's own probe (`pageProbe`);
   - `none`: neither; the honest line.
   Default: `key` when the host's key reads chat; else `page` when the page's probe answers; else `none`. */
import type { PageProbe } from "@crewhub/loops-client";

export type ChatRoad = "key" | "page" | "none";

export interface ChatRoadInput {
  /** Whether the host's key reads the chat; null when the host has not said (no health, a host from before). */
  hostKeyReadsChat: boolean | null;
  pageProbe: PageProbe;
}

export function decideChatRoad(input: ChatRoadInput): ChatRoad {
  if (input.hostKeyReadsChat === true) return "key";
  if (input.pageProbe === "on") return "page";
  return "none";
}
