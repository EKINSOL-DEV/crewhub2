import { createContext, useContext } from "react";
import type { SessionId } from "@/ipc/bindings";

export interface ChatContextValue {
  sessionId: SessionId;
  /** History mode renders read-only (EKI-60). */
  readOnly: boolean;
  /** Fork-from-checkpoint (EKI-64); absent until the panel wires it. */
  rewindTo?: (checkpointId: string) => void;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue | null {
  return useContext(ChatContext);
}
