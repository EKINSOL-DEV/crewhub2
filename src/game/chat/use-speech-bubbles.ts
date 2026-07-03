// Live speech bubbles (M2 T2): subscribe to the engine event stream while the
// game canvas is mounted; expire bubbles on a coarse interval. Ported from
// panels/world/use-speech-bubbles.ts (same subscription + 1s prune), renamed
// to avoid clashing with the panel's own hook.
import { useEffect, useState } from "react";
import { onEngineEvent } from "@/ipc/events";
import { pruneSpeech, speechFromEvent, type SpeechMap } from "./speech";

export function useGameSpeechBubbles(): SpeechMap {
  const [map, setMap] = useState<SpeechMap>({});

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    onEngineEvent((ev) => {
      const got = speechFromEvent(ev, Date.now());
      if (got) setMap((m) => ({ ...m, [got.key]: got.entry }));
    })
      .then((un) => {
        if (disposed) un();
        else unlisten = un;
      })
      .catch(() => {
        // event bridge unavailable (tests/dev without tauri) — no bubbles
      });
    const timer = window.setInterval(() => setMap((m) => pruneSpeech(m, Date.now())), 1000);
    return () => {
      disposed = true;
      unlisten?.();
      window.clearInterval(timer);
    };
  }, []);

  return map;
}
