/* What the world adds around the copied chat (components/bubbles): its query client, live updates from the demo source's
   event stream, the view that picks the default head, and the "settings" navigation. */
import { QueryClient, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Envelope } from "@crewhub/loops-client";
import { shouldRetry } from "../api/client";
import { dmKeys } from "../components/bubbles/queries";
import { setNavigator } from "../shims/react-router-dom";
import { demoChatApi } from "./chatApi";
import { worldRuntime } from "./world";

/** The defaults loops' AppProviders gives its client. */
export function createChatQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: shouldRetry } } });
}

/** loops `state/events.tsx` `invalidationsFor`, the chat part: DM events and chat deliveries refresh messages and unread. */
export function chatInvalidations(e: Pick<Envelope, "type" | "payload">): QueryKey[] {
  if (e.type.startsWith("dm.") || typeof e.payload["dmThreadId"] === "string") return [["dm-messages"], ["dm-threads"]];
  return [];
}

/**
 * Live updates, the way loops' event stream drives the chat: every chat event invalidates the copy's query keys. A new
 * snapshot (a seek or a new loop of the demo) rewinds the store, so everything the chat shows is read again.
 */
export function useChatEvents(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const chat = worldRuntime().chat;
    if (!chat) return;
    return chat.start((message) => {
      if (message.type === "snapshot") {
        for (const key of [["dm-threads"], ["dm-messages"], ["dm-summary"], ["agents"]]) void qc.invalidateQueries({ queryKey: key });
      } else if (message.type === "event") {
        for (const key of chatInvalidations(message.envelope)) void qc.invalidateQueries({ queryKey: key });
      }
    });
  }, [qc]);
}

/** The default head follows the view (the lead of the building you are in, else the crewhub lead) until the person pins. */
export function useChatView(leadId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!worldRuntime().chat) return;
    demoChatApi().setView({ leadId });
    void qc.invalidateQueries({ queryKey: dmKeys.pins });
  }, [qc, leadId]);
}

/** Where the chat's navigations go: `/settings/...` opens the world's Settings card; there is nothing else to open. */
export function useChatNavigation(openSettings: () => void): void {
  useEffect(() => {
    setNavigator((to) => {
      if (to.startsWith("/settings")) openSettings();
    });
    return () => setNavigator(null);
  }, [openSettings]);
}
