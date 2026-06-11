// Cross-panel "open this session in a chat panel" gesture.
// TODO(merge): replace with Lane A's workspace-store action (open/focus a chat
// leaf with params { sessionId, mode }) once the shell lands — until then Lane C
// panels dispatch a DOM event the shell can adopt or replace wholesale.

export interface OpenChatRequest {
  provider: string;
  id: string;
  /** "history" opens the read-only chat mode (EKI-60, Lane B). */
  mode?: "live" | "history";
  /** Optional transcript anchor (activity click-through, EKI-76). */
  seq?: number;
}

export const OPEN_CHAT_EVENT = "crewhub:open-chat";

export function requestOpenChat(req: OpenChatRequest): void {
  window.dispatchEvent(new CustomEvent<OpenChatRequest>(OPEN_CHAT_EVENT, { detail: req }));
}

export function onOpenChatRequest(handler: (req: OpenChatRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<OpenChatRequest>).detail);
  window.addEventListener(OPEN_CHAT_EVENT, listener);
  return () => window.removeEventListener(OPEN_CHAT_EVENT, listener);
}
