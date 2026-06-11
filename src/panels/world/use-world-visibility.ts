// Frameloop gate (EKI-62/77): the canvas only renders while its container is
// actually on screen — panel occluded (IntersectionObserver) or app window
// hidden (visibilitychange) flips the R3F frameloop to "never".
import { useEffect, useState, type RefObject } from "react";

export function useWorldVisibility(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  const [docVisible, setDocVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setInView(e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    const onChange = () => setDocVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return inView && docVisible;
}
