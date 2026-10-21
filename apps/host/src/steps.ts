/**
 * The step list `npm run world` prints: one line per step with a tick or a cross and the time it took, an
 * instruction line without a mark (something the person must do), "the world is up" once, counted from the key's
 * acceptance (the person pasting the key is not the host's time), and later snapshots (another tab, a re-snapshot)
 * as one quiet counted line instead of a ticked step each. Pure: the clock is injected, the lines are returned.
 */
import type { HostStep } from "./host.ts";

export const seconds = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** A ticked (or crossed) step line. */
export const stepLine = (ok: boolean, text: string, ms?: number) => `  ${ok ? "✓" : "✗"} ${text}${ms === undefined ? "" : ` (${seconds(ms)})`}`;

/** An instruction for the person: no mark, it is not a step that happened. */
export const instructionLine = (text: string) => `    ${text}`;

/** A quiet line: something that happened but is not a step of the road. */
export const quietLine = (text: string) => `  · ${text}`;

export interface StepPrinter {
  /** The lines for this step (none when it is quiet). */
  lines(step: HostStep): string[];
}

/** `now` is the clock (ms since the host started, `performance.now()`). */
export function createStepPrinter(now: () => number): StepPrinter {
  let keyAt: number | null = null;
  let snapshots = 0;
  return {
    lines(step) {
      if (step.step === "key" && step.ok) keyAt = now();
      if (step.step === "snapshot" && step.ok) {
        snapshots += 1;
        if (snapshots > 1) return [quietLine(`snapshot again (${snapshots}): ${step.text.replace(/^snapshot: /, "")}`)];
        const since = keyAt === null ? `${seconds(now())} after the host started` : `${seconds(now() - keyAt)} after the key`;
        return [stepLine(true, step.text, step.ms), stepLine(true, `the world is up, ${since}`)];
      }
      return [stepLine(step.ok, step.text, step.ms)];
    },
  };
}
