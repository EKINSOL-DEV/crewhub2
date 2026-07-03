// Live speech bubbles (M2 T2): subscribe to the engine event stream while the
// game canvas is mounted; expire bubbles on a coarse interval. Ported from
// panels/world/use-speech-bubbles.ts (same subscription + 1s prune), renamed
// to avoid clashing with the panel's own hook.
//
// M7 T3: the bubble map moved from local `useState` into a small zustand
// store so it can be pushed to from OUTSIDE this hook's tree — chat replies
// for demo bots and session-less crew (see use-chat-session.ts) happen in
// ChatWindow, which lives outside <Canvas>, same cross-boundary problem
// command-bus.ts solves for sim commands. Unlike the command bus, bubbles
// need to be reactive (Characters.tsx must re-render when one appears), so a
// store fits better than a drain-once queue.
import { useEffect } from "react";
import { create } from "zustand";
import { onEngineEvent } from "@/ipc/events";
import { pruneSpeech, speechFromEvent, trimSpeech, type SpeechMap } from "./speech";

interface SpeechBubbleStore {
  map: SpeechMap;
}

const useSpeechBubbleStore = create<SpeechBubbleStore>(() => ({ map: {} }));

/**
 * Push a bubble that didn't come from a transcript AssistantText event: a
 * "say" reply or command acknowledgement for a bot with no live session
 * behind it. Same store (so same TTL/expiry) as engine-derived bubbles —
 * Characters.tsx's "speech wins over thought" precedence can't tell the two
 * apart, by design.
 */
export function pushLocalBubble(key: string, text: string): void {
  const trimmed = trimSpeech(text);
  if (!trimmed) return;
  useSpeechBubbleStore.setState((s) => ({ map: { ...s.map, [key]: { text: trimmed, ts: Date.now() } } }));
}

export function useGameSpeechBubbles(): SpeechMap {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    onEngineEvent((ev) => {
      const got = speechFromEvent(ev, Date.now());
      if (got) {
        useSpeechBubbleStore.setState((s) => ({ map: { ...s.map, [got.key]: got.entry } }));
      }
    })
      .then((un) => {
        if (disposed) un();
        else unlisten = un;
      })
      .catch(() => {
        // event bridge unavailable (tests/dev without tauri) — no bubbles
      });
    const timer = window.setInterval(
      () => useSpeechBubbleStore.setState((s) => ({ map: pruneSpeech(s.map, Date.now()) })),
      1000,
    );
    return () => {
      disposed = true;
      unlisten?.();
      window.clearInterval(timer);
    };
  }, []);

  return useSpeechBubbleStore((s) => s.map);
}

/** Test-only reset — mirrors the resetXForTests() convention elsewhere. */
export function resetSpeechBubblesForTests(): void {
  useSpeechBubbleStore.setState({ map: {} });
}
