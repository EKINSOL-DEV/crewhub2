/* Which chat queries an event refreshes (state/chat.ts's live updates). Pure, so a node test can pin it: chat.ts itself
   reaches the world runtime and React. */
import type { QueryKey } from "@tanstack/react-query";
import type { Envelope } from "@crewhub/loops-client";

/** loops `state/events.tsx` `invalidationsFor`, the chat part: DM events and chat deliveries refresh messages and unread. */
export function chatInvalidations(e: Pick<Envelope, "type" | "payload">): QueryKey[] {
  if (e.type.startsWith("dm.") || typeof e.payload["dmThreadId"] === "string") return [["dm-messages"], ["dm-threads"]];
  return [];
}
