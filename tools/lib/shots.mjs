/* The world in screenshots: a list of views, in every theme and at every width asked for. Shared by shots.mjs (one
   run) and castworld.mjs (one run per cast). */
import { castChoice, dressed, seek, speed, store, watch, worldUrl } from "./world.mjs";

export const VIEWS = ["town", "building", "room", "walk", "stress", "person"];

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
 *   holding the package its figure is clicked (under its name pill) for a shot of its plate.
 * `scenario` is the demo scenario of every view but stress (left out: the default storyline).
 * Returns { count, notes }: how many files were written and what to tell (the overlay lines).
 */
export async function worldShots(browser, { base, origin, out, views, themes, widths, cast = null, scenario = null, stress = "1", plan = null, building = 0, room = 0, buildings = 6, rooms = 7, settle = 3500, seekMs = 200000, frames = 12, everyMs = 2000, zoom = false, problems, name }) {
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
        await enter(p, building);
        if (zoom) {
          for (let k = 0; k <= room; k++) await p.keyboard.press("ArrowRight");
          await p.keyboard.press("Enter");
          await p.waitForTimeout(1500);
        }
        /** Clicks just under the person's name pill (the figure's head), so the pick lands on the figure. */
        const pickPerson = async () => {
          const box = await p
            .evaluate(() => {
              const pill = [...document.querySelectorAll(".world-labels .name-pill.person")].find((e) => e.getBoundingClientRect().width > 0);
              if (!pill) return null;
              const r = pill.getBoundingClientRect();
              // The pill hangs over the head; 24 px under it is the figure's body (closer is the rack's packages behind).
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
