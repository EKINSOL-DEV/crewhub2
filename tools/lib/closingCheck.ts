/* Regress's whole-run console check (round 60, A7): which page problems fail the run. Every page regress opens is
   watched (`watch` in lib/world.mjs) and its page errors and console errors fail the run, with the admitted lines
   judged here and nothing broader. Tested by scripts/test/closingCheck.test.ts. */

import { isProbeRefusal, type PageProblem } from "./probeRefusal.ts";

/** A host restart a group makes on purpose: its pages' origin, the tag `watch` puts on their lines, and its window (ms). */
export interface HostRestart {
  origin: string;
  tag: string;
  from: number;
  to: number;
}

export interface ClosingVerdict {
  /** The problems that fail the run. */
  failing: PageProblem[];
  /** The road-2 probe's refusal lines (lib/probeRefusal.ts). */
  probeRefusals: PageProblem[];
}

/**
 * Judges a run's page problems: an external request is judged by its own check and left out, the probe's refusal lines
 * at the run's loops origins are admitted, and every other page error or console error fails the run.
 */
export function closingCheck(problems: readonly PageProblem[], { loopsOrigins }: { loopsOrigins: readonly string[]; restarts: readonly HostRestart[] }): ClosingVerdict {
  const failing: PageProblem[] = [];
  const probeRefusals: PageProblem[] = [];
  for (const problem of problems) {
    if (problem.kind === "external") continue;
    if (isProbeRefusal(problem, loopsOrigins)) probeRefusals.push(problem);
    else failing.push(problem);
  }
  return { failing, probeRefusals };
}
