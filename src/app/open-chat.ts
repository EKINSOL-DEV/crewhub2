// Cross-panel "open this session in a chat panel" action (D-M2-2): sessions,
// activity, history and the crew bar all funnel through here.
//
// EKI-121 (game-HUD shell): in the main window the chat opens as a drawer
// over the world — the workspace tree only survives in `?window=` routes,
// where the classic focus/adopt/split adoption still applies.
import { useWorkspace } from "@/stores/workspace";
import { leaves } from "./layout-tree";
import { isPanelWindow, useOverlays } from "./overlays";

export interface OpenChatRequest {
  provider: string;
  id: string;
  /** "history" opens the read-only chat mode (EKI-60). */
  mode?: "live" | "history";
  /** Optional transcript anchor (activity click-through, EKI-76). */
  seq?: number;
  /** Panel annotation shown in the meta strip, e.g. "fork of …". */
  note?: string;
}

export function openChatPanel(req: OpenChatRequest): void {
  const key = `${req.provider}:${req.id}`;
  const params: Record<string, string> = { sessionId: key };
  if (req.mode === "history") params.mode = "history";
  if (req.seq !== undefined) params.seq = String(req.seq);
  if (req.note) params.note = req.note;

  // Main window: the chat is a drawer over the world (EKI-121).
  if (!isPanelWindow()) {
    useOverlays.getState().open("chat", params);
    return;
  }

  const s = useWorkspace.getState();
  const tab = s.tabs.find((t) => t.id === s.activeTabId);
  if (!tab) return; // workspace not loaded yet — nothing sane to do

  const ls = leaves(tab.root);

  // 1. A chat panel already on this session → focus it (refresh mode/anchor).
  const existing = ls.find((l) => l.kind === "chat" && l.params?.sessionId === key);
  if (existing) {
    s.setPanelParams(existing.id, { ...existing.params, ...params });
    s.focusLeaf(existing.id);
    return;
  }

  // 2. An unbound chat or a fresh welcome leaf → adopt it.
  const adoptable =
    ls.find((l) => l.kind === "chat" && !l.params?.sessionId) ?? ls.find((l) => l.kind === "welcome");
  if (adoptable) {
    s.replacePanel(adoptable.id, "chat", params);
    s.focusLeaf(adoptable.id);
    return;
  }

  // 3. Otherwise split the focused (or last) leaf into a new chat panel.
  const anchor = ls.find((l) => l.id === s.focusedLeafId) ?? ls[ls.length - 1];
  if (!anchor) return;
  s.split(anchor.id, "row", "chat");
  const focused = useWorkspace.getState().focusedLeafId; // split() focuses the new leaf
  if (focused) s.setPanelParams(focused, params);
}
