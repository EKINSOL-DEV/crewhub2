/* Regress's whole-run console check (round 60, A7): which page problems fail the run. Every page regress opens is
   watched (`watch` in lib/world.mjs) and its page errors and console errors fail the run, with the admitted lines
   judged here and nothing broader:
   - the road-2 probe's two refusal lines at a loops origin of the run (lib/probeRefusal.ts, rounds 28 and 32);
   - a refused health read inside a host restart the run made on purpose. The town group closes its host and starts the
     next on the same port three times; a town page whose stream drops reads `/world-api/health` at once (the
     page's host-health module re-reads on the stream's word, as it should: it is how a Forget in another tab reaches
     the Connect screen), and a read that lands while the port is closed is refused. The browser prints it as
     "Failed to load resource: net::ERR_CONNECTION_REFUSED" (RESET when the close cut it), which the page can neither
     catch nor silence. Recorded runs (030bbb70, 4 of 8 town runs) heard it 8 to 24 ms after the close began and up
     to about 15 ms after the next host listened, and a full run under load (53c50f4a) up to 43 ms after: the line
     reaches the tool after the refusal. RESTART_GRACE_MS is that lag's allowance, with room for a loaded machine, and
     far short of the 2.6 s between two restarts.
   The connect group judges its own pages' lines before they reach the whole-run check (`connectGroupAdmits`): the
   browser logs every 4xx and 5xx a fetch meets, and the group's screens are made of them: the refused key's 403, the
   unpaired tab's 401, the 503 no_key the other tab's stream meets when it reconnects after a Forget elsewhere (the
   stub ends the streams; a real host keeps them), and (a full run under load, 53c50f4a, once in two) the forgetting
   tab's own read of a ticket, a thin event's refetch, landing after the Forget's answer and before that tab reloads
   onto the Connect screen: 503 no_key on `/world-api/tickets/<id>`, inside the Forget's window and nowhere else.
   Tested by scripts/test/closingCheck.test.ts, on recorded runs with the flake and with that 503. */

import { isProbeRefusal, type PageProblem } from "./probeRefusal.ts";

/** A host restart a group makes on purpose: its pages' origin, the tag `watch` puts on their lines, and its window (ms). */
export interface HostRestart {
  origin: string;
  tag: string;
  from: number;
  to: number;
}

/** A Forget the connect group makes on purpose in one tab: that tab's origin and tag, and its window (ms): the click to the tab live again. */
export interface ForgetWindow {
  tag: string;
  pageOrigin: string;
  from: number;
  to: number;
}

export interface ClosingVerdict {
  /** The problems that fail the run. */
  failing: PageProblem[];
  /** The road-2 probe's refusal lines (lib/probeRefusal.ts). */
  probeRefusals: PageProblem[];
  /** The health reads refused inside a host restart of the run. */
  restartRefusals: PageProblem[];
}

/** How long after a restart's new host listens a refusal from inside the restart may still be heard (ms). */
export const RESTART_GRACE_MS = 1000;

const HEALTH = "/world-api/health";
const REFUSED = /^Failed to load resource: net::ERR_CONNECTION_(REFUSED|RESET)$/;

/** Whether `problem` is a refused health read of a restart's pages, heard inside that restart's window. */
function isRestartRefusal(problem: PageProblem, restarts: readonly HostRestart[]): boolean {
  if (problem.kind !== "console" || problem.at === undefined || !problem.url || !URL.canParse(problem.url)) return false;
  const url = new URL(problem.url);
  if (url.pathname !== HEALTH) return false;
  const at = problem.at;
  return restarts.some((restart) => {
    const prefix = `[${restart.tag}] `;
    return (
      problem.pageOrigin === restart.origin &&
      url.origin === restart.origin &&
      problem.text.startsWith(prefix) &&
      REFUSED.test(problem.text.slice(prefix.length)) &&
      at >= restart.from &&
      at <= restart.to + RESTART_GRACE_MS
    );
  });
}

/**
 * Judges a run's page problems: an external request is judged by its own check and left out, the probe's refusal lines
 * at the run's loops origins and the health reads refused inside one of `restarts` are admitted, and every other page
 * error or console error fails the run.
 */
export function closingCheck(problems: readonly PageProblem[], { loopsOrigins, restarts }: { loopsOrigins: readonly string[]; restarts: readonly HostRestart[] }): ClosingVerdict {
  const verdict: ClosingVerdict = { failing: [], probeRefusals: [], restartRefusals: [] };
  for (const problem of problems) {
    if (problem.kind === "external") continue;
    if (isProbeRefusal(problem, loopsOrigins)) verdict.probeRefusals.push(problem);
    else if (isRestartRefusal(problem, restarts)) verdict.restartRefusals.push(problem);
    else verdict.failing.push(problem);
  }
  return verdict;
}

const STATUS = /status of (\d{3})/;

/**
 * The connect group's own rule for its pages' lines (judged before the whole-run check): a 401 or 403 on any of its
 * pages, a 503 on the other tab, and a 503 on a `/world-api/` read of the forgetting tab inside one of `forgets`.
 */
export function connectGroupAdmits(problem: PageProblem, forgets: readonly ForgetWindow[] = []): boolean {
  if (problem.kind !== "console") return false;
  const status = STATUS.exec(problem.text)?.[1];
  if (status === "401" || status === "403") return true;
  if (status !== "503") return false;
  if (/\[connect stub other tab\]/.test(problem.text)) return true;
  // The forgetting tab's own read inside its Forget: a `/world-api/` path at that tab's origin, heard in the window.
  if (problem.at === undefined || !problem.url || !URL.canParse(problem.url)) return false;
  const url = new URL(problem.url);
  const at = problem.at;
  return forgets.some((forget) => problem.pageOrigin === forget.pageOrigin && url.origin === forget.pageOrigin && url.pathname.startsWith("/world-api/") && problem.text.startsWith(`[${forget.tag}] `) && at >= forget.from && at <= forget.to);
}
