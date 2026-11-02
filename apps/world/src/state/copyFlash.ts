/* The Pair screen's Copy button (components/PairPage.tsx) as data: what a copy did, and the timer that turns "Copied"
   back, injected so a test drives it without a DOM. */

export type CopyState = "idle" | "copied" | "failed";

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

export interface CopyFlash {
  copy(clipboard: ClipboardLike | undefined, text: string): Promise<CopyState>;
  dispose(): void;
}

type Schedule = (fn: () => void, ms: number) => () => void;
const timeout: Schedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/**
 * A copy says what happened: "copied" (back to "idle" after `ms`), or "failed" when there is no clipboard (an insecure
 * origin, a LAN address over http) or the browser refuses (round 50, r48-ui N1). `dispose()` cancels the pending timer
 * and makes a late answer change nothing, for when the screen goes (N3).
 */
export function createCopyFlash(onChange: (state: CopyState) => void, schedule: Schedule = timeout, ms = 2000): CopyFlash {
  let cancel: (() => void) | null = null;
  let live = true;
  return {
    async copy(clipboard, text) {
      cancel?.();
      cancel = null;
      const state: CopyState = clipboard
        ? await clipboard.writeText(text).then(
            () => "copied" as const,
            () => "failed" as const,
          )
        : "failed";
      if (!live) return state;
      onChange(state);
      if (state === "copied")
        cancel = schedule(() => {
          cancel = null;
          onChange("idle");
        }, ms);
      return state;
    },
    dispose() {
      live = false;
      cancel?.();
      cancel = null;
    },
  };
}
