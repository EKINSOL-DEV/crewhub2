// In-world conversation feed (EKI-116/118): transcript tail on mount, live
// engine items after. Shared by the bot side panel (read-only recent
// activity) and the floating chat window.
import { useEffect, useState } from "react";
import { commands, type SeqItem } from "@/ipc/bindings";
import { onEngineEvent } from "@/ipc/events";
import { sessionKey } from "@/stores/sessions";
import type { WorldBot } from "./lib/bots";

export interface ChatLine {
  who: "user" | "bot";
  text: string;
}

const CHAT_TAIL_FETCH = 120; // transcript items to pull (most are tool noise)
export const CHAT_LINES_MAX = 40;
const CHAT_LINE_CHARS = 600;

export function chatLine(who: ChatLine["who"], text: string): ChatLine | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return { who, text: flat.length > CHAT_LINE_CHARS ? `${flat.slice(0, CHAT_LINE_CHARS - 1)}…` : flat };
}

function linesFromItems(items: SeqItem[]): ChatLine[] {
  const out: ChatLine[] = [];
  for (const { item } of items) {
    if (item.kind === "UserText") {
      const l = chatLine("user", item.data.text);
      if (l) out.push(l);
    } else if (item.kind === "AssistantText") {
      const l = chatLine("bot", item.data.text);
      if (l) out.push(l);
    }
  }
  return out.slice(-CHAT_LINES_MAX);
}

/**
 * Tail + live conversation for one bot. Callers must remount per bot
 * (key={bot.key}) — state never crosses bots.
 */
export function useBotChat(bot: WorldBot): { lines: ChatLine[]; push: (l: ChatLine | null) => void } {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const push = (l: ChatLine | null) => {
    if (l) setLines((prev) => [...prev, l].slice(-CHAT_LINES_MAX));
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const probe = await commands.getSessionTranscript(bot.id, 0, 1);
        if (!live || probe.status !== "ok") return;
        const offset = Math.max(0, probe.data.total - CHAT_TAIL_FETCH);
        const page = await commands.getSessionTranscript(bot.id, offset, CHAT_TAIL_FETCH);
        if (!live || page.status !== "ok") return;
        setLines((prev) => (prev.length ? prev : linesFromItems(page.data.items)));
      } catch {
        // transcript unavailable — the input still works
      }
    })();

    let unlisten: (() => void) | null = null;
    onEngineEvent((ev) => {
      if (ev.type !== "Item" || sessionKey(ev.data.id) !== bot.key) return;
      const item = ev.data.item;
      if (item.kind === "AssistantText") push(chatLine("bot", item.data.text));
      else if (item.kind === "UserText") {
        const l = chatLine("user", item.data.text);
        if (!l) return;
        // The composer pushes optimistically; the engine echoes the same
        // UserText moments later — drop the echo, not honest repeats
        // (every send is optimistic-first, so repeats still pair up).
        setLines((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.who === "user" && last.text === l.text) return prev;
          return [...prev, l].slice(-CHAT_LINES_MAX);
        });
      }
    })
      .then((un) => {
        if (live) unlisten = un;
        else un();
      })
      .catch(() => undefined);

    return () => {
      live = false;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bot.key covers bot.id
  }, [bot.key]);

  return { lines, push };
}
