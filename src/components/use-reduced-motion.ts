import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void): () => void {
  const mq = typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
  if (!mq) return () => {};
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function snapshot(): boolean {
  return typeof window.matchMedia === "function" ? window.matchMedia(QUERY).matches : false;
}

/** All playfulness animations respect `prefers-reduced-motion` (D-M2-6). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
