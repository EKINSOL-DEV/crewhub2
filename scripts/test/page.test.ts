/* A tool's page through its interface (tools/lib/page.mjs, round 60 T2), the pure part: the viewport rule (a phone is a
   touch device with a tall screen, every other width a desktop window 900 high), the context options a theme, a device
   scale and reduced motion map to, and the order `openPage` composes the pieces in, over a browser stand-in that
   records what it was asked (no Chromium here; the tools running are the rest of the proof). */
import assert from "node:assert/strict";
import test from "node:test";
import { contextOptions, openPage, viewportFor } from "../../tools/lib/page.mjs";

test("the viewport rule: a phone up to 480 wide is a touch device 812 high, anything wider a 900-high window", () => {
  assert.deepEqual(viewportFor(375), { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  assert.deepEqual(viewportFor(480), { viewport: { width: 480, height: 812 }, isMobile: true, hasTouch: true });
  assert.deepEqual(viewportFor(481), { viewport: { width: 481, height: 900 } });
  assert.deepEqual(viewportFor(1440), { viewport: { width: 1440, height: 900 } });
});

test("the context options: the defaults are a light 1440 window at scale 1 with nothing said about motion", () => {
  assert.deepEqual(contextOptions(), { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
  assert.deepEqual(contextOptions({ width: 375, theme: "dark", reducedMotion: "reduce" }), { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: "dark", reducedMotion: "reduce" });
  assert.deepEqual(contextOptions({ width: 1440, dpr: 2 }), { viewport: { width: 1440, height: 900 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: "light" }, "a device scale above 1 is a touch device whatever the width (perf.mjs's phone at 2x)");
});

/** A browser that records the context it was asked for and the page's moves, in order. */
function fakeBrowser() {
  const moves: string[] = [];
  let contextOptionsAsked: unknown = null;
  const page = {
    context: () => context,
    on: (event: string) => moves.push(`on ${event}`),
    async goto(url: string, options?: { waitUntil?: string }) {
      moves.push(`goto ${url}${options?.waitUntil ? ` (${options.waitUntil})` : ""}`);
    },
  };
  const context = {
    async addInitScript(_fn: unknown, pairs: [string, string][]) {
      moves.push(`store ${pairs.map(([k, v]) => `${k}=${v}`).join(",")}`);
    },
    async newPage() {
      moves.push("newPage");
      return page;
    },
    async newCDPSession() {
      return { async send(method: string, params: { rate: number }) { moves.push(`${method} ${params.rate}`); } };
    },
  };
  const browser = {
    async newContext(options: unknown) {
      contextOptionsAsked = options;
      moves.push("newContext");
      return context;
    },
  };
  return { browser, moves, asked: () => contextOptionsAsked, page };
}

test("openPage composes the pieces in order: the context, the stored settings, the page, the watch, the throttle, the pairing, the address", async () => {
  const { browser, moves, asked, page } = fakeBrowser();
  const problems: unknown[] = [];
  const opened = await openPage(browser, { origin: "http://127.0.0.1:5399", width: 375, theme: "dark", store: { "crewhub-world.cast": "sprouts", "crewhub-world.fps": null }, cpuThrottle: 4, problems, tag: "t", pair: async (p) => { moves.push(`pair ${p === page}`); }, url: "http://127.0.0.1:5399/?tour=on", waitUntil: "load" });
  assert.equal(opened, page);
  assert.deepEqual(asked(), { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: "dark" });
  assert.deepEqual(moves, ["newContext", "store crewhub-world.cast=sprouts", "newPage", "on pageerror", "on console", "on request", "Emulation.setCPUThrottlingRate 4", "pair true", "goto http://127.0.0.1:5399/?tour=on (load)"]);
});

test("openPage with nothing but a browser opens a bare light window: no store, no watch, no throttle, no address", async () => {
  const { browser, moves, asked } = fakeBrowser();
  await openPage(browser);
  assert.deepEqual(asked(), { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light" });
  assert.deepEqual(moves, ["newContext", "newPage"]);
});
