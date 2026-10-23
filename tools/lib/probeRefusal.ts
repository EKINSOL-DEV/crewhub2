/* The road-2 probe's refusal as the browser prints it (rounds 28 and 32). A live page whose host's key does not read
   the chat probes `GET /api/dm/threads` at the loops web origin the host names, with credentials; a loops whose
   `CHL_WORLD_ORIGIN` is not set answers without a CORS header (the verdict `origin-not-set`), and the browser prints two
   console errors the page can neither catch nor silence: the CORS line for that route from the page's own origin, and
   "Failed to load resource" for the same URL (`net::ERR_FAILED` when nothing readable came back, "the server responded
   with a status of 401 (Unauthorized)" when loops answered the cookie-less ask and the browser then withheld it). The
   closing checks of regress.mjs and a11y.mjs admit exactly those two lines, for the loops origins of their run, and
   nothing broader. Tested by scripts/test/probeRefusal.test.ts. */

/** A problem as `watch` in lib/world.mjs records it: the console line, the page's origin, the URL the browser blames. */
export interface PageProblem {
  kind: string;
  text: string;
  pageOrigin: string;
  url?: string;
}

const THREADS = "/api/dm/threads";

/** Whether `problem` is one of the probe's two refusal lines at one of `loopsOrigins`. */
export function isProbeRefusal(problem: PageProblem, loopsOrigins: readonly string[]): boolean {
  if (problem.kind !== "console") return false;
  const text = problem.text.replace(/^\[[^\]]*\] /, "");
  for (const origin of loopsOrigins) {
    if (text === `Access to fetch at '${origin}${THREADS}' from origin '${problem.pageOrigin}' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`) return true;
    if (problem.url === `${origin}${THREADS}` && (text === "Failed to load resource: net::ERR_FAILED" || /^Failed to load resource: the server responded with a status of \d{3} \([A-Za-z ]+\)$/.test(text))) return true;
  }
  return false;
}
