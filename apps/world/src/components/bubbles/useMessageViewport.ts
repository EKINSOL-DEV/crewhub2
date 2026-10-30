// Source: crewhub-loops apps/web/src/components/bubbles/useMessageViewport.ts @ a1bed0f. Copied verbatim; do not edit here, change the source and re-copy.
import { useEffect, useLayoutEffect, useRef } from "react";
import type { DmMessage } from "../../api/types";

const READ_ATTEMPTS = 3;
const READ_BACKOFF_MS = 1_000;

/** A read cursor follows visible message ends, never merely the newest API result. */
export function useMessageViewport(messages: DmMessage[], markRead: (id: string, options: { onError: () => void; onSuccess: () => void }) => void, composerText: string) {
  const body = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  // Keep the budget across mutation renders, query refreshes and observer replacement.
  const progress = useRef({ confirmed: null as string | null, visible: undefined as string | undefined, attempts: 0, inFlight: false, retryAt: 0 });
  const reconcile = useRef<(() => void) | null>(null);
  const latest = messages.at(-1)?.id;
  useLayoutEffect(() => {
    const node = body.current;
    if (node && atBottom.current) node.scrollTop = node.scrollHeight;
  }, [latest, composerText]);
  useEffect(() => {
    const node = body.current;
    if (!node) return;
    // A cached thread in a native dialog becomes measurable only after showModal().
    if (atBottom.current) node.scrollTop = node.scrollHeight;
    let previousTop = node.scrollTop;
    const onScroll = () => {
      // A delayed event from our own scroll must not interpret later content growth as history reading.
      if (node.scrollTop < previousTop || !atBottom.current) atBottom.current = node.scrollHeight - node.clientHeight - node.scrollTop < 24;
      previousTop = node.scrollTop;
    };
    const markers = [...node.querySelectorAll<HTMLElement>("[data-read-message]")];
    const positions = new Map(messages.map((m, index) => [m.id, index]));
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const markVisible = (restart = false) => {
      if (document.hidden || !document.hasFocus() || node.clientHeight === 0 || !node.getClientRects().length) return;
      const bounds = node.getBoundingClientRect();
      let candidate: string | undefined;
      for (const marker of markers) {
        const rect = marker.getBoundingClientRect();
        if (rect.top >= bounds.top && rect.bottom <= bounds.bottom) candidate = marker.dataset.readMessage;
      }
      const state = progress.current;
      if (state.inFlight) return;
      if (candidate !== state.visible || restart) {
        state.visible = candidate;
        state.attempts = 0;
        state.retryAt = 0;
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      if (!candidate || (positions.get(candidate) ?? -1) <= (positions.get(state.confirmed ?? "") ?? -1) || state.attempts >= READ_ATTEMPTS) return;
      const remaining = state.retryAt - Date.now();
      if (remaining > 0) {
        retryTimer ??= setTimeout(() => { retryTimer = undefined; reconcile.current?.(); }, remaining);
        return;
      }
      state.attempts++;
      state.inFlight = true;
      markRead(candidate, {
        onSuccess: () => {
          state.confirmed = candidate;
          state.inFlight = false;
          reconcile.current?.();
        },
        onError: () => {
          state.inFlight = false;
          state.retryAt = Date.now() + READ_BACKOFF_MS * 2 ** (state.attempts - 1);
          reconcile.current?.();
        },
      });
    };
    reconcile.current = () => markVisible();
    const onReturn = () => markVisible(true);
    // Font loading and viewport changes can resize content without changing message IDs.
    const resize = new ResizeObserver(() => {
      if (atBottom.current) { node.scrollTop = node.scrollHeight; previousTop = node.scrollTop; }
      markVisible();
    });
    resize.observe(node);
    const thread = node.querySelector(".thread");
    if (thread) resize.observe(thread, { box: "border-box" });
    const observer = new IntersectionObserver(() => markVisible(), { root: node, threshold: 1 });
    for (const marker of markers) observer.observe(marker);
    node.addEventListener("scroll", onScroll);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    markVisible();
    return () => {
      reconcile.current = null;
      clearTimeout(retryTimer);
      observer.disconnect();
      resize.disconnect();
      node.removeEventListener("scroll", onScroll);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [messages, markRead]);
  return { bodyRef: body, readingHistory: () => { atBottom.current = false; } };
}
