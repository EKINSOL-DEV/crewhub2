/* Which chat queries an event or a snapshot refreshes, and where the chat's navigations go (state/chat.ts). Pure, so a
   node test can pin them: chat.ts itself reaches the world runtime and React. */
import type { QueryKey } from "@tanstack/react-query";
import type { Envelope } from "@crewhub/loops-client";

/** loops `state/events.tsx` `invalidationsFor`, the chat part: DM events and chat deliveries refresh messages and unread. */
export function chatInvalidations(e: Pick<Envelope, "type" | "payload">): QueryKey[] {
  if (e.type.startsWith("dm.") || typeof e.payload["dmThreadId"] === "string") return [["dm-messages"], ["dm-threads"]];
  return [];
}

/** A new snapshot (a seek or a new loop of the demo) rewinds the store: everything the chat shows is read again. */
export function snapshotInvalidations(): QueryKey[] {
  return [["dm-threads"], ["dm-messages"], ["dm-summary"], ["agents"]];
}

/** `/settings/...` opens the world's Settings card; there is nothing else to open. */
export function opensSettings(to: string): boolean {
  return to.startsWith("/settings");
}
