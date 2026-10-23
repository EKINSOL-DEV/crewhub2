/* The closing checks' one admitted refusal (tools/lib/probeRefusal.ts): the road-2 probe's CORS line and its "Failed to
   load resource" line for the threads route at a loops origin of the run, from the page's origin; any other line, route,
   origin or kind stays a problem. */
import assert from "node:assert/strict";
import test from "node:test";
import { isProbeRefusal, type PageProblem } from "../../tools/lib/probeRefusal.ts";

const LOOPS = "http://127.0.0.1:57633";
const PAGE = "http://127.0.0.1:5297";
const cors = (loops: string, page: string) => `Access to fetch at '${loops}/api/dm/threads' from origin '${page}' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`;
const problem = (text: string, more: Partial<PageProblem> = {}): PageProblem => ({ kind: "console", text, pageOrigin: PAGE, url: "", ...more });

test("the probe's two refusal lines are admitted, at a loops origin of the run, from the page's origin, a tag prefix stripped", () => {
  assert.ok(isProbeRefusal(problem(cors(LOOPS, PAGE)), [LOOPS]), "the CORS line");
  assert.ok(isProbeRefusal(problem(`[light 1440] ${cors(LOOPS, PAGE)}`), [LOOPS]), "with the tool's tag in front");
  assert.ok(isProbeRefusal(problem("Failed to load resource: net::ERR_FAILED", { url: `${LOOPS}/api/dm/threads` }), [LOOPS]), "the failed-resource line for the threads URL");
  assert.ok(isProbeRefusal(problem("[dark 375] Failed to load resource: the server responded with a status of 401 (Unauthorized)", { url: `${LOOPS}/api/dm/threads` }), [LOOPS]), "the second form, when loops answered the cookie-less ask");
  assert.ok(isProbeRefusal(problem(cors(LOOPS, PAGE)), ["http://127.0.0.1:8291", LOOPS]), "any origin of the run");
});

test("nothing broader: another route, another origin, another page, another kind, a failed resource elsewhere", () => {
  assert.equal(isProbeRefusal(problem(cors(LOOPS, PAGE)), []), false, "no loops origin known: a problem");
  assert.equal(isProbeRefusal(problem(cors("http://127.0.0.1:8091", PAGE)), [LOOPS]), false, "an origin not of the run (the Mac app)");
  assert.equal(isProbeRefusal(problem(cors(LOOPS, "http://127.0.0.1:5180")), [LOOPS]), false, "another page's origin");
  assert.equal(isProbeRefusal(problem(cors(LOOPS, PAGE).replace("/api/dm/threads", "/api/team")), [LOOPS]), false, "another route");
  assert.equal(isProbeRefusal(problem("Failed to load resource: net::ERR_FAILED", { url: `${LOOPS}/api/team` }), [LOOPS]), false, "a failed resource that is not the probe");
  assert.equal(isProbeRefusal(problem("Failed to load resource: net::ERR_FAILED"), [LOOPS]), false, "no URL blamed");
  assert.equal(isProbeRefusal(problem("Failed to load resource: net::ERR_CONNECTION_REFUSED", { url: `${LOOPS}/api/dm/threads` }), [LOOPS]), false, "another failure at the route");
  assert.equal(isProbeRefusal(problem(cors(LOOPS, PAGE), { kind: "external" }), [LOOPS]), false, "an external request is judged by its own rule");
  assert.equal(isProbeRefusal(problem(cors(LOOPS, PAGE), { kind: "pageerror" }), [LOOPS]), false, "a page error never");
});
