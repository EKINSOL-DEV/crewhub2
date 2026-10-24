/* The world in screenshots: a list of views, in every theme and at every width asked for. Shared by shots.mjs (one
   run) and castworld.mjs (one run per cast). */
import { castChoice, dressed, seek, speed, store, watch, worldUrl } from "./world.mjs";

export const VIEWS = ["town", "building", "room", "walk", "stress", "person", "events"];

/** A phone is a touch device with a tall screen; every other width is a desktop window 900 high. */
const viewport = (width) => (width <= 480 ? { viewport: { width, height: 812 }, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } });

/**
 * Takes the shots. `name(view, theme, width)` gives each file its name (without the directory and ".png").
 * - town: the home view;
 * - building: Enter on building number `building` (0 is the first; ArrowRight moves on);
 * - room: that building's room number `room`, zoomed (ArrowRight and Enter);
 * - walk: every one of the first `buildings` buildings and each of its rooms, a shot per stop;
 * - stress: the stress fixture (?stress=<n>, dev builds only) at 4x after 12 s, in the town and inside the second
 *   building, with the dev overlay's numbers as a line in the result;
 * - person: a person carrying work into Done (spec addendum "a person in the world"): the demo is sought to `seekMs`
 *   (just before a move into Done by the storyline's person), building `building` is entered, and `frames` shots
 *   follow, `everyMs` apart, at 1x; each frame's note says where the person is (dev builds: `window.__town`). With
 *   `zoom` the hall number `room` is zoomed first (ArrowRight and Enter), and at the first frame that finds the person
 *   holding the package its figure is clicked (under its name pill) for a shot of its plate. `personSpeed` ("1x",
 *   "4x" or "16x") is the playback speed the frames are taken at.
 * `scenario` is the demo scenario of every view but stress (left out: the default storyline).
 * Returns { count, notes }: how many files were written and what to tell (the overlay lines).
 */
export async function worldShots(browser, { base, origin, out, views, themes, widths, cast = null, scenario = null, stress = "1", plan = null, building = 0, room = 0, buildings = 6, rooms = 7, settle = 3500, seekMs = 200000, frames = 12, everyMs = 2000, zoom = false, personSpeed = "1x", problems, name }) {
  const notes = [];
  let count = 0;
  for (const theme of themes) {
    for (const width of widths) {
      const open = async (url) => {
        const ctx = await browser.newContext({ ...viewport(width), deviceScaleFactor: 1, colorScheme: theme });
        await store(ctx, castChoice(cast));
        const p = await ctx.newPage();
        watch(p, origin, problems, `${theme} ${width}`);
        await p.goto(url);
        await dressed(p);
        await p.waitForTimeout(settle);
        return p;
      };
      const shot = async (p, view) => {
        await p.screenshot({ path: `${out}${name(view, theme, width)}.png` });
        count++;
      };
      const enter = async (p, index) => {
        await p.locator("canvas").first().focus();
        for (let k = 0; k < index; k++) await p.keyboard.press("ArrowRight");
        await p.keyboard.press("Enter");
        await p.waitForTimeout(2500);
      };
      if (views.some((v) => ["town", "building", "room"].includes(v))) {
        const p = await open(worldUrl(base, null, scenario, plan));
        if (views.includes("town")) await shot(p, "town");
        if (views.includes("building") || views.includes("room")) {
          await enter(p, building);
          if (views.includes("building")) await shot(p, "building");
          if (views.includes("room")) {
            for (let k = 0; k <= room; k++) await p.keyboard.press("ArrowRight");
            await p.keyboard.press("Enter");
            await p.waitForTimeout(2000);
            await shot(p, "room");
          }
        }
        await p.context().close();
      }
      if (views.includes("walk")) {
        const p = await open(worldUrl(base, null, scenario, plan));
        for (let i = 0; i < buildings; i++) {
          await enter(p, i);
          await shot(p, `walk-b${i}`);
          for (let r = 0; r < rooms; r++) {
            await p.keyboard.press("ArrowRight");
            await p.keyboard.press("Enter");
            await p.waitForTimeout(1500);
            await shot(p, `walk-b${i}-r${r}`);
            await p.keyboard.press("Escape");
            await p.waitForTimeout(400);
          }
          await p.keyboard.press("Escape");
          await p.keyboard.press("Escape");
          await p.waitForTimeout(1500);
        }
        await p.context().close();
      }
      if (views.includes("person")) {
        const p = await open(worldUrl(base, null, scenario, plan));
        if (!(await seek(p, seekMs))) notes.push(`${theme} ${width}: no timeline slider to seek with`);
        if (personSpeed !== "1x") await speed(p, personSpeed).catch(() => notes.push(`${theme} ${width}: no "Play at ${personSpeed}" button`));
        await enter(p, building);
        if (zoom) {
          for (let k = 0; k <= room; k++) await p.keyboard.press("ArrowRight");
          await p.keyboard.press("Enter");
          await p.waitForTimeout(1500);
        }
        /** Clicks the person's figure: its body, projected through the scene's camera (dev builds, `window.__town`), else
            just under its name pill (the pill hangs over the head; but it climbs over the tags it passes, so under it
            may be a sign). */
        const pickPerson = async () => {
          const box = await p
            .evaluate(() => {
              const t = globalThis.__town;
              const canvas = document.querySelector("canvas");
              const w = t?.persons ? [...t.persons.persons()].find((x) => x.holding) ?? [...t.persons.persons()][0] : null;
              if (w && canvas && t.camera) {
                // The figure's body is about 0.6 up from its feet (what the camera follows); three's Vector3 through
                // the camera's own position's class.
                const v = new t.camera.position.constructor(w.x, w.y + 0.6, w.z).project(t.camera);
                const r = canvas.getBoundingClientRect();
                return { x: r.left + (v.x * 0.5 + 0.5) * canvas.clientWidth, y: r.top + (-v.y * 0.5 + 0.5) * canvas.clientHeight };
              }
              const pill = [...document.querySelectorAll(".world-labels .name-pill.person")].find((e) => e.getBoundingClientRect().width > 0);
              if (!pill) return null;
              const r = pill.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.bottom + 24 };
            })
            .catch(() => null);
          if (!box) return "no person pill to click";
          await p.mouse.click(box.x, box.y);
          await p.waitForTimeout(400);
          const plate = await p.locator(".world-labels .person-plate").innerText().catch(() => "");
          return plate ? `plate: ${plate.replace(/\n/g, " | ")}` : "no plate after the click";
        };
        const where = () =>
          p
            .evaluate(() => {
              const t = globalThis.__town;
              const people = t?.persons ? [...t.persons.persons()] : [];
              const visits = (t?.view?.model?.buildings ?? []).filter((b) => b.slug === t?.view?.entered).flatMap((b) => b.visits.map((v) => `${v.displayName} ${v.phase} ${v.ticketKey}`));
              return `${people.map((w) => `${w.visit.displayName} ${w.phase}${w.holding ? " holding" : ""}${w.delivered ? " delivered" : ""} (${w.x.toFixed(1)}, ${w.z.toFixed(1)})`).join("; ") || "nobody"} | model: ${visits.join("; ") || "no visit"}`;
            })
            .catch(() => "?");
        let picked = false;
        for (let i = 0; i < frames; i++) {
          await p.waitForTimeout(everyMs);
          const tag = `person-${String(i).padStart(2, "0")}`;
          await shot(p, tag);
          const line = await where();
          notes.push(`PERSON ${tag} (${theme}, ${width}): ${line}`);
          if (zoom && !picked && / holding/.test(line)) {
            picked = true;
            notes.push(`PERSON pick (${theme}, ${width}): ${await pickPerson()}`);
            await shot(p, "person-plate");
            await p.keyboard.press("Escape");
          }
        }
        await p.context().close();
      }
      if (views.includes("events")) {
        // The new loops events (spec addendum, round 7): the quiet fact's dust and tag on CR-17 (8:10), the card an
        // automation run pins on the board by the front door (8:40 on CR-20; 8:52 failed on CL-76). Each shot waits
        // for the model's state (dev builds, `window.__town`), never for the clock, with the playback paused for it.
        const p = await open(worldUrl(base, null, scenario, plan));
        const model = (fn) => p.evaluate((src) => { const t = globalThis.__town; const m = t?.view?.model; return m ? new Function("m", "t", `return (${src})(m, t)`)(m, t) : null; }, fn.toString()).catch(() => null);
        const untilModel = async (check, ms = 20000) => { const d = Date.now() + ms; while (Date.now() < d) { if (await model(check)) return true; await p.waitForTimeout(250); } return false; };
        const pause = () => p.getByRole("button", { name: "Pause", exact: true }).click().catch(() => notes.push(`${theme} ${width}: no Pause button`));
        const enterSlug = async (slug) => {
          await p.locator("canvas").first().focus();
          for (let i = 0; i < 8; i++) {
            await p.keyboard.press("Enter");
            await p.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 4000 }).catch(() => {});
            await p.waitForTimeout(1500);
            if ((await p.evaluate(() => globalThis.__town?.view?.entered).catch(() => null)) === slug) return true;
            for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
            await p.waitForTimeout(800);
            await p.locator("canvas").first().focus();
            await p.keyboard.press("ArrowRight");
          }
          notes.push(`${theme} ${width}: could not enter ${slug}`);
          return false;
        };
        const leave = async () => {
          for (let k = 0; k < 3; k++) await p.keyboard.press("Escape");
          await p.waitForTimeout(1200);
        };
        const stage = async (tag, seekMs, playback, ready, slug, details) => {
          if (!(await seek(p, seekMs))) notes.push(`${theme} ${width}: no timeline slider to seek with`);
          await speed(p, playback).catch(() => notes.push(`${theme} ${width}: no "Play at ${playback}" button`));
          if (!(await untilModel(ready))) notes.push(`${theme} ${width}: ${tag} did not come within 20 s of play`);
          await pause();
          await enterSlug(slug);
          if (details) await p.keyboard.press("d");
          await p.waitForTimeout(1500);
          await shot(p, tag);
          if (details) await p.keyboard.press("d");
          await leave();
        };
        await stage("events-quiet", 485000, "16x", (m) => m.buildings.some((b) => b.objects.some((o) => o.quiet)), "crewhub", true);
        await stage("events-board", 519000, "4x", (m) => m.buildings.some((b) => b.slug === "crewhub" && b.board.some((c) => c.from <= m.now)), "crewhub", false);
        await stage("events-board-failed", 530000, "4x", (m) => m.buildings.some((b) => b.slug === "crewhub-loops" && b.board.some((c) => c.outcome === "failed" && c.from <= m.now)), "crewhub-loops", false);
        await p.context().close();
      }
      if (views.includes("stress")) {
        const p = await open(worldUrl(base, stress, null, plan));
        await speed(p, "4x").catch(() => notes.push(`${theme} ${width}: no "Play at 4x" button on the stress page`));
        await p.waitForTimeout(12000);
        const overlay = () => p.locator(".dev-overlay").innerText().then((t) => t.replace(/\n/g, " | ")).catch(() => "no overlay");
        notes.push(`STRESS town (${theme}, ${width}): ${await overlay()}`);
        await shot(p, "stress-town");
        await enter(p, 1);
        await p.waitForTimeout(9500);
        notes.push(`STRESS inside (${theme}, ${width}): ${await overlay()}`);
        await shot(p, "stress-inside");
        await p.context().close();
      }
    }
  }
  return { count, notes };
}
