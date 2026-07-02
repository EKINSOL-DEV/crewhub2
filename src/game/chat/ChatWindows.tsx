// Chat windows host (M2 T3): reads the open-chats registry and mounts one
// <ChatWindow> per key, stacked in array order (store.ts: last = top).
// Name/color resolve off `useSessionsView()`'s agent join — self-contained
// by design, no lookup prop from GameShell. `agent:` keys (resting crew,
// no session yet) are filtered out here: clicking them opens the hire
// dialog instead (Task 5), so there's never a window to mount for one.
import { useSessionsView } from "@/stores/sessions";
import { ChatWindow } from "./ChatWindow";
import { useGameChats } from "./store";

const FALLBACK_COLOR = "#94a3b8";

export function ChatWindows() {
  const chats = useGameChats((s) => s.chats);
  const views = useSessionsView();
  const openable = chats.filter((c) => !c.key.startsWith("agent:"));

  return (
    <>
      {openable.map((chat, i) => {
        const view = views.find((v) => v.key === chat.key);
        const name = view?.displayName ?? chat.key.split(":").pop() ?? chat.key;
        const color = view?.agent?.color ?? FALLBACK_COLOR;
        return (
          <ChatWindow
            key={chat.key}
            chatKey={chat.key}
            name={name}
            color={color}
            minimized={chat.min}
            stackIndex={i}
            onClose={() => useGameChats.getState().close(chat.key)}
            onMinimize={(min) => useGameChats.getState().setMin(chat.key, min)}
            onFocusChat={() => useGameChats.getState().raise(chat.key)}
          />
        );
      })}
    </>
  );
}
