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
  let nextStackIndex = 0;
  const stackIndices = openable.map((c) => ((layout[c.key]?.pos ?? null) === null ? nextStackIndex++ : -1));

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
