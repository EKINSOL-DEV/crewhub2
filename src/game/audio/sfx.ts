// UI sound effects (M4 T5): CC0 clips from Kenney's Interface Sounds pack,
// picked and copied to public/assets/sfx/ by build-sfx.mjs. The AudioContext
// is created lazily on the first playSfx call — every call site here is a
// click handler, so the browser's user-gesture requirement is satisfied for
// free. Mute state follows quality.ts's KV-persisted store pattern.
import { create } from "zustand";
import { commands } from "@/ipc/bindings";

export type SfxName = "click" | "place" | "remove" | "chat-open" | "send" | "hire";

export const MUTED_SETTING_KEY = "game.muted";

const VOLUME = 0.35;

interface AudioState {
  muted: boolean;
  init: () => Promise<void>;
  toggleMuted: () => void;
}

let requested = false;

export const useAudio = create<AudioState>((set, get) => ({
  muted: false,

  init: async () => {
    if (requested) return;
    requested = true;
    try {
      const res = await commands.getSetting(MUTED_SETTING_KEY);
      if (res.status === "ok" && res.data != null) {
        set({ muted: res.data === "1" });
      }
    } catch {
      // backend unavailable (unit tests, plain browser) — keep the default
    }
  },

  toggleMuted: () => {
    const muted = !get().muted;
    set({ muted });
    void commands.setSetting(MUTED_SETTING_KEY, muted ? "1" : "0").catch(() => undefined);
  },
}));

let ctx: AudioContext | null = null;

/** Undefined in jsdom (no Web Audio API) — playSfx just no-ops there. */
function getContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === "undefined") return null;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  return ctx;
}

// One fetch+decode per name, memoized for the process lifetime — a null
// result means the fetch/decode failed, and playSfx keeps silently no-op-ing
// for that name rather than retrying every click.
const buffers = new Map<SfxName, Promise<AudioBuffer | null>>();

function loadBuffer(name: SfxName, audioCtx: AudioContext): Promise<AudioBuffer | null> {
  let promise = buffers.get(name);
  if (!promise) {
    promise = fetch(`/assets/sfx/${name}.ogg`)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`sfx ${name}: ${res.status}`))))
      .then((data) => audioCtx.decodeAudioData(data))
      .catch(() => null);
    buffers.set(name, promise);
  }
  return promise;
}

export function playSfx(name: SfxName): void {
  if (useAudio.getState().muted) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  // WebKit/WKWebView (what Tauri ships on macOS) constructs a new
  // AudioContext already suspended, even from inside a gesture handler —
  // resume() must be called explicitly or source.start() silently never
  // plays. Fire-and-forget: resume() and playback scheduling can race
  // harmlessly, the context just buffers until it's running.
  if (audioCtx.state === "suspended") void audioCtx.resume();
  void loadBuffer(name, audioCtx).then((buffer) => {
    if (!buffer) return;
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.value = VOLUME;
    source.connect(gain).connect(audioCtx.destination);
    source.start();
  });
}

/** Test hook: clears the mute store, the once-only init guard, the decode
 * cache, and the AudioContext singleton — so each test starts fresh. */
export function resetAudioForTests(): void {
  requested = false;
  useAudio.setState({ muted: false });
  buffers.clear();
  ctx = null;
}
