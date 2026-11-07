/* A window keydown listener added once (round 32). The handler closes over the render's values, so it is a new function
   every render; the listener is one function that calls the latest handler through a ref, added in an effect without
   dependencies. The effect that listed every value the handler read re-added the listener on nearly every render (the
   soak's listener churn, rounds 29 and 30: 526 add-and-remove pairs in two minutes of facts at 16x). The ref is written
   in a layout effect, right after the commit, so a key pressed after a render reaches the handler of that render. */
import { useEffect, useLayoutEffect, useRef } from "react";

export type KeyHandler = (e: KeyboardEvent) => void;

export function useWindowKeydown(handler: KeyHandler): void {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => latest.current(e);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
}
