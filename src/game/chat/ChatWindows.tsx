// Chat windows host (M2 T3): reads the open-chats registry and mounts one
// <ChatWindow> per key, stacked in array order (store.ts: last = top).
// Name/color resolve off `useSessionsView()`'s agent join — self-contained
// by design, no lookup prop from GameShell. `agent:` keys (resting crew,
// no session yet) are filtered out here: clicking them opens the hire
// dialog instead (Task 5), so there's never a window to mount for one.
// EKI resize follow-up: pos/size now live in store.ts's per-key `layout` map
// (not on the `chats` entries themselves) — this component is also the one
// spot that kicks off `loadLayout()`, since it's the self-contained mount
// point for the whole chat feature and there's no other chat-owned bootstrap
// to hang it off (GameShell.tsx's init effect is out of scope here).
import { useEffect } from "react";
import { useSessionsView } from "@/stores/sessions";
import { ChatWindow } from "./ChatWindow";
import { useGameChats } from "./store";
import { DEFAULT_SIZE } from "./window-clamp";

const FALLBACK_COLOR = "#94a3b8";

export function ChatWindows() {
  const chats = useGameChats((s) => s.chats);
  const layout = useGameChats((s) => s.layout);
  const views = useSessionsView();
  const openable = chats.filter((c) => !c.key.startsWith("agent:"));

  useEffect(() => {
    void useGameChats.getState().loadLayout();
  }, []);

  // Draggable windows (pos set) leave the bottom-right stack entirely — only
  // the still-stacked (pos === null) windows get a compacting stackIndex, so
  // the rest of the stack closes the gap a dragged-away window leaves behind.
  // Each stacked window's slot also carries a stackOffset: the cumulative
  // actual width (live `size.w`, or DEFAULT_SIZE.w when never resized) of
  // every OTHER stacked window before it in that same compacted order. A
  // dragged window contributes no width here — it's already excluded from
  // the stack entirely — so widening one still-stacked window pushes every
  // later stacked window further right/left by the real delta, instead of
  // the old fixed-per-slot gap silently letting them overlap (ChatWindow.tsx
  // combines this with STACK_RIGHT/STACK_GAP into the final `right` style).
  // A minimized window's chip is 48px (h-12 w-12 in ChatWindow.tsx) — count
  // that, not the full box width, so the stack packs tight around chips.
  const MIN_CHIP_WIDTH = 48;
  let nextStackIndex = 0;
  let cumulativeWidth = 0;
  const stackIndices: number[] = [];
  const stackOffsets: number[] = [];
  for (const c of openable) {
    if ((layout[c.key]?.pos ?? null) === null) {
      stackIndices.push(nextStackIndex++);
      stackOffsets.push(cumulativeWidth);
      // A minimized window renders as a small chip, not its full box — count
      // it at chip width so the stack packs tight around it (debt-sweep
      // review catch).
      cumulativeWidth += c.min ? MIN_CHIP_WIDTH : (layout[c.key]?.size?.w ?? DEFAULT_SIZE.w);
    } else {
      stackIndices.push(-1);
      stackOffsets.push(0);
    }
  }

  return (
    <>
      {openable.map((chat, i) => {
        const view = views.find((v) => v.key === chat.key);
        const name = view?.displayName ?? chat.key.split(":").pop() ?? chat.key;
        const color = view?.agent?.color ?? FALLBACK_COLOR;
        const entry = layout[chat.key];
        return (
          <ChatWindow
            key={chat.key}
            chatKey={chat.key}
            name={name}
            color={color}
            minimized={chat.min}
            stackIndex={stackIndices[i]!}
            stackOffset={stackOffsets[i]!}
            pos={entry?.pos ?? null}
            onDrag={(pos) => useGameChats.getState().setPos(chat.key, pos)}
            size={entry?.size ?? null}
            onResize={(size) => useGameChats.getState().setSize(chat.key, size)}
            demo={chat.key.startsWith("demo:")}
            onClose={() => useGameChats.getState().close(chat.key)}
            onMinimize={(min) => useGameChats.getState().setMin(chat.key, min)}
            onFocusChat={() => useGameChats.getState().raise(chat.key)}
          />
        );
      })}
    </>
  );
}
