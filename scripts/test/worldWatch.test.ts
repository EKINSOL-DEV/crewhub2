/* The tools' closing check "no request leaves the page's origin" (tools/lib/world.mjs `watch`, round 51, review T1): own
   means the same origin, not a URL that starts with the origin's text, so a page on :5389 does not take a request to
   :53891 (a fake's free port) or to a user-info host for its own. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { watch } from "../../tools/lib/world.mjs";

type Problem = { kind: string; url?: string };

function requests(origin: string, urls: string[]): string[] {
  const page = new EventEmitter();
  const problems: Problem[] = [];
  watch(page, origin, problems);
  for (const url of urls) page.emit("request", { url: () => url, method: () => "GET" });
  return problems.filter((p) => p.kind === "external").map((p) => p.url as string);
}

test("a request is the page's own only on the page's own origin", () => {
  const origin = "http://127.0.0.1:5389";
  const own = [`${origin}/`, `${origin}/world-api/health`, `${origin}/assets/index-a1b2c3d4.js?x=1`, "data:image/png;base64,AAAA", "blob:http://127.0.0.1:5389/0f1e"];
  assert.deepEqual(requests(origin, own), [], "the page's own requests are no problem");
  const stray = ["http://127.0.0.1:53891/api/events", "http://127.0.0.1:5389@example.com/", "http://localhost:5389/", "https://127.0.0.1:5389/", "http://127.0.0.1:538/"];
  assert.deepEqual(requests(origin, stray), stray, "every other origin is external, whatever its text starts with");
});
