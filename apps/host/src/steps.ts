/**
 * The step list `npm run world` prints: one line per step with a tick or a cross and the time it took, an
 * instruction line without a mark (something the person must do), "the world is up" once, on the first paired browser
 * that attaches (its snapshot, or its stream back at a cursor after a host restart), counted from the host's start and,
 * when a key was accepted in this run, from the key as well (the person pasting the key is not the host's time); a
 * person's later tab never moves it. Later snapshots (another tab, a re-snapshot) are one quiet counted line instead of
 * a ticked step each, later attaches print nothing. Pure: the clock is injected, the lines are returned.
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
  let up = false;
  const upLine = () => {
    up = true;
    const sinceKey = keyAt === null ? "" : ` (${seconds(now() - keyAt)} after the key)`;
    return stepLine(true, `the world is up, ${seconds(now())} after the host started${sinceKey}`);
  };
  return {
    lines(step) {
      if (step.step === "key" && step.ok) keyAt = now();
      if (step.step === "snapshot" && step.ok) {
        snapshots += 1;
        const lines = snapshots > 1 ? [quietLine(`snapshot again (${snapshots}): ${step.text.replace(/^snapshot: /, "")}`)] : [stepLine(true, step.text, step.ms)];
        if (!up) lines.push(upLine());
        return lines;
      }
      if (step.step === "browser") return up ? [] : [stepLine(true, step.text), upLine()];
      return [stepLine(step.ok, step.text, step.ms)];
    },
  };
}
