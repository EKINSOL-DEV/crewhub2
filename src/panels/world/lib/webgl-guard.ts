// WebGL availability + context-loss guard for the world canvas.
//
// A `webglcontextlost` event is a SUSPICION, not a verdict: StrictMode's
// double-pass disposes a twin renderer whose forced loss fires (seconds
// later) on the SAME canvas element the live renderer uses, and WebKit
// reclaims its small context budget with transient losses the browser then
// restores by itself (three.js preventDefaults + reinitializes). Unmounting
// the canvas on the first event turns every transient loss into a permanent
// "no WebGL" screen — so the guard waits a grace period and then asks the
// authoritative source: is the live context STILL lost?

export interface ContextGuardOpts {
  canvas: HTMLCanvasElement;
  /** Is this canvas still the one the panel renders? Stale events bail out. */
  isActive: () => boolean;
  /** Authoritative check, e.g. `() => gl.getContext().isContextLost()`. */
  isLost: () => boolean;
  /** Receives true only for a verified persistent loss; false on restore. */
  onVerdict: (failed: boolean) => void;
  graceMs?: number;
}

export const DEFAULT_GRACE_MS = 2500;

/** Attach loss/restore listeners; returns a detach function. */
export function attachContextGuard({
  canvas,
  isActive,
  isLost,
  onVerdict,
  graceMs = DEFAULT_GRACE_MS,
}: ContextGuardOpts): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onContextLost = (e: Event) => {
    if (e.target !== canvas || !isActive()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (isActive() && isLost()) onVerdict(true);
    }, graceMs);
  };
  const onContextRestored = () => {
    clearTimeout(timer);
    timer = undefined;
    onVerdict(false);
  };

  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  return () => {
    clearTimeout(timer);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
  };
}

/**
 * One-shot availability probe. Releases its context immediately — WebGL
 * contexts are a scarce per-page budget (WebKit force-loses the oldest when
 * it runs out, which is exactly the spurious event the guard exists for).
 */
export function probeWebgl(doc: Document = document): boolean {
  const canvas = doc.createElement("canvas");
  const ctx = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as
    | WebGLRenderingContext
    | WebGL2RenderingContext
    | null;
  if (!ctx) return false;
  ctx.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}
