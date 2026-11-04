/* A tool's page (round 60, T2): the context (the viewport by width, the theme, the device scale, reduced motion), the
   stored settings the app reads before it starts, the watch for what must never happen, the CPU throttle, the pairing
   step, the address, and the wait for the page's state; beside it the page's locators as one table, so every tool reads
   the same screens, chips, labels and lines. `lib/world.mjs` owns the pieces (`launch`, `watch`, `store`, `dressed`,
   `seek`, `speed`, `worldUrl`); this module is their composition, which every tool wrote for itself before.

   Tooling only: nothing under apps/ or packages/ imports this folder. */
import { dressed, store, watch } from "./world.mjs";

/** A phone is a touch device with a tall screen; every other width is a desktop window 900 high. */
export const viewportFor = (width) => (width <= 480 ? { viewport: { width, height: 812 }, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });

/**
 * The browser context's options for a tool's page: the viewport of `viewportFor(width)`, a touch device (`isMobile`,
 * `hasTouch`) when `touch` says so (left out: a phone up to 480 wide, or a device scale above 1, whatever the width),
 * the device scale factor (1 unless `dpr`), the theme as the colour scheme, reduced motion when asked.
 */
export function contextOptions({ width = 1440, theme = "light", dpr = 1, touch = null, reducedMotion = null } = {}) {
  const { viewport } = viewportFor(width);
  const touchDevice = touch === null ? width <= 480 || dpr > 1 : touch;
  return {
    viewport,
    ...(touchDevice ? { isMobile: true, hasTouch: true } : {}),
    deviceScaleFactor: dpr,
    colorScheme: theme,
    ...(reducedMotion === null ? {} : { reducedMotion }),
  };
}

/** Playwright's own context keys: a caller of `openPage` says width, theme, dpr and touch instead, never these. */
const PLAYWRIGHT_KEYS = ["viewport", "colorScheme", "isMobile", "hasTouch", "deviceScaleFactor"];

/**
 * Opens a page in a context of its own and answers it. `width`, `theme`, `dpr`, `touch` and `reducedMotion` are the
 * context's (`contextOptions`); the browser's own keys are refused. `origin` is the page's own origin for the watch (what leaves it
 * is a problem); `problems` the list the watch fills, `tag` its label; left out, nothing is watched. `store` are the
 * localStorage entries set before the app reads them (null and undefined values skipped); `cpuThrottle` above 1 slows
 * the page's CPU through the browser's own throttle; `pair` is the rig's pairing step, run before the first address;
 * `initScripts` run in the page before the app, after the store (a measurement's observer); `url` is opened last, with
 * `waitUntil` when given. The context is the page's (`page.context()`).
 */
export async function openPage(browser, options = {}) {
  const stray = PLAYWRIGHT_KEYS.filter((key) => key in options);
  if (stray.length > 0) throw new Error(`openPage: ${stray.join(", ")} ${stray.length === 1 ? "is" : "are"} the browser's own: say width, theme, dpr and touch`);
  const { origin, width, theme, dpr, touch, reducedMotion, store: entries = null, initScripts = [], cpuThrottle = 1, problems = null, tag = "", pair = null, url = null, waitUntil = null } = options;
  const context = await browser.newContext(contextOptions({ width, theme, dpr, touch, reducedMotion }));
  if (entries !== null) await store(context, entries);
  for (const script of initScripts) await context.addInitScript(script);
  const page = await context.newPage();
  if (problems !== null) watch(page, origin, problems, tag);
  if (cpuThrottle > 1) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  if (pair !== null) await pair(page);
  if (url !== null) await page.goto(url, waitUntil === null ? undefined : { waitUntil });
  return page;
}

/**
 * Waits for the page's state: "canvas" (the scene's canvas is there), "dressed" (the town drawn and dressed, the app's
 * `world:town-dressed` mark), "perf" (dressed and the dev overlay's window, `__worldPerfWindow`, for the measurement
 * tools), "first-frame" (the app's `world:first-frame` mark). `timeout` in ms, 60 s unless given.
 */
export async function waitFor(page, state, timeout = 60000) {
  switch (state) {
    case "canvas":
      return page.waitForSelector("canvas", { timeout });
    case "dressed":
      return dressed(page, timeout);
    case "perf":
      return page.waitForFunction(() => performance.getEntriesByName("world:town-dressed").length > 0 && window.__worldPerfWindow, null, { timeout });
    case "first-frame":
      return page.waitForFunction(() => performance.getEntriesByName("world:first-frame").length > 0, null, { timeout });
    default:
      throw new Error(`waitFor: unknown state ${String(state)}`);
  }
}

// --- The page's locators, one table: the Connect screens, the connection chip, the text view, the breadcrumb, the labels.

/** The Connect screen `which` (`.connect-page[data-screen]`), waited for; throws after `timeout`. */
export const screen = (p, which, timeout = 15000) => p.waitForSelector(`.connect-page[data-screen="${which}"]`, { timeout });
/** Whether the Connect screen `which` shows within `timeout`: true or false, never a throw. */
export const screenShown = (p, which, timeout) =>
  p
    .waitForSelector(`.connect-page[data-screen="${which}"]`, { timeout })
    .then(() => true)
    .catch(() => false);
/** The Connect screen's title, whitespace folded. */
export const connectTitle = async (p) => (await p.locator("#connect-title").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
/** The connection chip in the header. */
export const chip = (p) => p.locator(".connection-chip").first();
/** What the chip says the connection is (`data-connection`), or null without a chip. */
export const chipWord = (p) => chip(p).getAttribute("data-connection").catch(() => null);
/** Waits for the chip to say `wanted` (quietly: a timeout is no throw) and answers what it says then. */
export const untilChip = async (p, wanted, timeout) => {
  await p.waitForSelector(`.connection-chip[data-connection="${wanted}"]`, { timeout }).catch(() => {});
  return chipWord(p);
};
/** The chip saying `which`, waited for; throws after `timeout`. */
export const waitChip = (p, which, timeout = 45000) => p.waitForSelector(`.connection-chip[data-connection="${which}"]`, { timeout });
/** The text view (T). */
export const textView = (p) => p.locator("#text-view");
/** Opens the text view (T), reads it and closes it again. */
export const readTextView = async (p) => {
  await p.keyboard.press("t");
  await p.waitForTimeout(400);
  const t = await textView(p).innerText().catch(() => "");
  await p.keyboard.press("Escape");
  return t;
};
/** The breadcrumb: how many levels it shows and the name of the current one. */
export const trail = (p) => p.locator("nav.world-breadcrumb");
export const levels = (p) => trail(p).getAttribute("data-levels").catch(() => null);
export const level = async (p) => (await trail(p).locator(".crumb-current").innerText().catch(() => "")).trim();
/** How many of the elements `selector` finds are drawn: a box on screen, not hidden, not faded out. */
export const drawn = (p, selector) =>
  p.evaluate((selector) => {
    const shown = (e) => {
      const box = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && e.closest(".anchor")?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
    };
    return [...document.querySelectorAll(selector)].filter(shown).length;
  }, selector);
/** The labels that show over the scene: every element of the label layer that is drawn and not faded out. */
export const labels = (p, selector = ".world-labels .anchor *") =>
  p.evaluate((selector) => {
    const shown = (e) => {
      const box = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && e.closest(".anchor")?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
    };
    return [...document.querySelectorAll(selector)].filter((e) => e.children.length === 0 || e.matches(".room-sign, .town-sign")).filter(shown).length;
  }, selector);
/** What the polite status line says after a key, as one string. */
export const announced = async (p, key, settle = 500) => {
  await p.keyboard.press(key);
  await p.waitForTimeout(settle);
  return (await p.locator("[aria-live=polite]").allInnerTexts()).join(" ").replace(/\s+/g, " ").trim();
};
