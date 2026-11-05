/**
 * The three-room building behind `?rooms=three`: the room signs and the rack sign, the arrow keys between the halls, the text
 * view's racks and desks, the lead's office beacon, the agent card at a desk, the walkers landing still, and walk mode in
 * through the front door, steered stop by stop (`page.walkTo`).
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { announced, drawn, labels, readTextView as text } from "../lib/page.mjs";
import { list, seek } from "../lib/world.mjs";

export async function run({ pass, page, check, out }) {
  const { base: BASE, repo: REPO } = pass;
  const { open, town, canvas, entered, visitor, walkTo } = page;
  const { ok } = check;
  const { shot } = out;
  // 16. The three-room building, behind `?rooms=three` whatever this browser's Buildings setting says. The halls are the
  // spec addendum's: Administration (the racks, the mailbox, the archive counter), the floor (desks, the huddle), the
  // lead's office. Their navigation ids are the hall's own model kind: lobby, workers, lead-office.
  const HALLS = ["Administration", "The floor", "Lead's office"];
  let p = await open();
  await town(p, 3000, `${BASE}?rooms=three`);
  // Round 33 (the mutation check of the scene's teardown, r33-mut-scene): what a browser sees once a scene is torn
  // down, in two teardowns. (a) StrictMode's rehearsal mount on the dev build makes a scene, disposes it and makes the
  // one that stays: the host holds one canvas, and no listener from the scene's own files (TownScene.ts,
  // WorldCanvas.tsx, three's OrbitControls) stands twice on window or document. (b) A scene made beside the live one
  // from the same view and disposed once laid out: its canvas keeps no listener (the scene's own, the controls' and
  // the renderer's), the interval it made is cleared, it draws no frame, its host no longer sizes its canvas, the
  // canvas is out of the host (and, put back, is not sized by the host again), and every geometry the scene alone
  // held is disposed.
  // The browser's own listener table for an object (CDP), each listener with the file and line of its handler.
  const inspector = async (page) => {
    const cdp = await page.context().newCDPSession(page);
    const scripts = new Map();
    cdp.on("Debugger.scriptParsed", (e) => scripts.set(e.scriptId, e.url));
    await cdp.send("Debugger.enable");
    const listenersOf = async (expression) => {
      const { result } = await cdp.send("Runtime.evaluate", { expression });
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
      await cdp.send("Runtime.releaseObject", { objectId: result.objectId }).catch(() => {});
      return listeners.map((l) => ({ type: l.type, capture: l.useCapture, url: scripts.get(l.scriptId) ?? "", line: l.lineNumber + 1, column: l.columnNumber + 1 }));
    };
    const close = async () => {
      await cdp.send("Debugger.disable").catch(() => {});
      await cdp.detach().catch(() => {});
    };
    return { listenersOf, close };
  };
  let { listenersOf, close: closeInspector } = await inspector(p);
  const sceneFiles = /TownScene\.ts|WorldCanvas\.tsx|OrbitControls/;
  const doubled = (list) => {
    const seen = new Map();
    for (const l of list) {
      if (!sceneFiles.test(l.url)) continue;
      const key = `${l.type}${l.capture ? " (capture)" : ""} ${l.url.replace(/^.*\//, "").replace(/\?.*$/, "")}:${l.line}:${l.column}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen].filter(([, n]) => n > 1).map(([key, n]) => `${key} ×${n}`);
  };
  const onWindow = await listenersOf("window");
  const onDocument = await listenersOf("document");
  const sceneOwned = [...onWindow, ...onDocument].filter((l) => sceneFiles.test(l.url)).length;
  const canvases = await p.locator(".canvas-host canvas").count();
  const twice = [...doubled(onWindow), ...doubled(onDocument)];
  ok("rooms (round 33, teardown a): StrictMode's rehearsal mount leaves one canvas in the host and no listener of the scene's files twice on window or document", canvases === 1 && sceneOwned > 0 && twice.length === 0, `${canvases} canvas(es); ${sceneOwned} listener(s) of the scene's files on window and document; doubled: ${twice.join(", ") || "none"}`);
  const made = await p.evaluate(async () => {
    const live = globalThis.__town;
    const { TownScene } = await import("/src/world/TownScene.ts");
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:320px;height:200px;opacity:0;pointer-events:none";
    const labels = document.createElement("div");
    document.body.append(host, labels);
    const intervals = [];
    const cleared = new Set();
    const setInterval0 = window.setInterval;
    const clearInterval0 = window.clearInterval;
    window.setInterval = (...args) => {
      const id = setInterval0.apply(window, args);
      intervals.push(id);
      return id;
    };
    window.clearInterval = (id) => {
      cleared.add(id);
      return clearInterval0.call(window, id);
    };
    const none = () => {};
    let ready = false;
    let scene = null;
    try {
      scene = new TownScene(host, labels, { ...live.view }, { enter: none, hover: none, pick: none, error: none, build: none, followed: none, followStopped: none, ready: () => (ready = true), walkPlace: none });
    } finally {
      // The constructor is synchronous: the intervals it made are the probe's. The dev probe points at the live scene again.
      window.setInterval = setInterval0;
      globalThis.__town = live;
    }
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 300 && !ready; i++) await pause(50);
    await frame();
    // Its host sizes it while it lives.
    const canvas = host.querySelector("canvas");
    host.style.width = "400px";
    await pause(100);
    await frame();
    const geometriesOf = (root) => {
      const set = new Set();
      root.traverse((o) => o.geometry && set.add(o.geometry));
      return set;
    };
    // Its own geometries: in its graph and not in the live scene's; the plots' hit boxes share one module constant.
    const shared = geometriesOf(live.scene);
    scene.scene.traverse((o) => o.userData.plot && o.geometry && shared.add(o.geometry));
    const own = [...geometriesOf(scene.scene)].filter((g) => !shared.has(g));
    const disposed = new Set();
    for (const g of own) {
      const dispose = g.dispose;
      g.dispose = function () {
        disposed.add(this);
        return dispose.call(this);
      };
    }
    globalThis.__probe = { scene, host, labels, canvas, intervals, cleared, own, disposed, restore: () => (window.clearInterval = clearInterval0) };
    return { ready, intervals: intervals.length, own: own.length, sizedAlive: canvas?.width ?? -1 };
  });
  const canvasListenersAlive = (await listenersOf("globalThis.__probe.canvas")).length;
  const gone = await p.evaluate(async () => {
    const { scene, host, labels, canvas, intervals, cleared, own, disposed, restore } = globalThis.__probe;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    scene.dispose();
    restore();
    let drawn = 0;
    scene.renderer.render = () => drawn++;
    const inHost = host.querySelector("canvas") !== null;
    // Its canvas put back in the host: a host that changes size must not reach the scene any more (its resize
    // handler sizes the canvas whenever the canvas has a parent).
    host.append(canvas);
    host.style.width = "480px";
    await pause(300);
    await frame();
    const left = own.filter((g) => !disposed.has(g)).map((g) => `${g.type}${g.name ? ` ${g.name}` : ""}`);
    return { intervalsLeft: intervals.filter((id) => !cleared.has(id)).length, drawn, sizedAfter: canvas.width, inHost, left: left.length, leftNames: [...new Set(left)].slice(0, 6).join(", ") };
  });
  const canvasListenersAfter = (await listenersOf("globalThis.__probe.canvas")).length;
  await p.evaluate(() => {
    globalThis.__probe.host.remove();
    globalThis.__probe.labels.remove();
    delete globalThis.__probe;
  });
  await closeInspector();
  ok("rooms (round 33, teardown b): a scene made beside the live one and disposed once laid out keeps no listener on its canvas, clears its interval, draws no frame, leaves the host and is not sized by it again, and disposes every geometry it alone held", made.ready && made.intervals > 0 && made.own > 0 && canvasListenersAlive > 0 && canvasListenersAfter === 0 && gone.intervalsLeft === 0 && gone.drawn === 0 && made.sizedAlive === 400 && gone.sizedAfter === 400 && !gone.inHost && gone.left === 0, `laid out ${made.ready}; canvas listeners ${canvasListenersAlive} alive, ${canvasListenersAfter} after; intervals ${made.intervals} made, ${gone.intervalsLeft} left; frames drawn after ${gone.drawn}; canvas width ${made.sizedAlive} alive (host 400), ${gone.sizedAfter} after (host 480); in host after: ${gone.inHost}; own geometries ${made.own}, undisposed ${gone.left}${gone.left ? ` (${gone.leftNames})` : ""}`);
  await canvas(p).focus();
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(2000);
  const slug = await entered(p);
  await p.keyboard.press("d");
  await p.waitForTimeout(900);
  // The halls' signs; the four racks in Administration carry signs of their own (`.rack-sign`), counted apart.
  const signs = (await p.locator(".world-labels .room-sign:not(.rack-sign) strong").allInnerTexts()).map((t) => t.trim());
  const racks = (await p.locator(".world-labels .rack-sign").allInnerTexts()).map((t) => t.trim());
  await shot(p, "26-rooms-signs");
  await p.keyboard.press("d");
  await p.waitForTimeout(400);
  ok("rooms: three room signs in a building", signs.length === 3 && HALLS.every((h) => signs.includes(h)), `${signs.join(", ")} (in ${slug})`);
  // The label layout keeps the rack signs from overlapping, so it shows one or more of the four at a time.
  const RACKS = ["Backlog", "Planning", "Review", "Done"];
  ok("rooms: a rack sign in Administration with its count", racks.length > 0 && racks.every((r) => RACKS.some((n) => r.startsWith(n)) && /\d+ tickets?$/.test(r)), racks.join(", "));

  // 17. The arrow keys move the focus between the three halls; the status line sums each hall up.
  const first = await announced(p, "ArrowRight");
  const north = await announced(p, "ArrowUp");
  const west = await announced(p, "ArrowLeft");
  const halls = [first, north, west].map((t) => HALLS.find((h) => t.includes(`${h}:`)) ?? "?");
  ok("rooms: arrow keys move between the three halls", new Set(halls).size === 3 && !halls.includes("?"), `${halls.join(" → ")}; "${west.slice(0, 100)}"`);
  await shot(p, "27-rooms-focus");

  // 18. The text view tells the halls' story: racks with counts, desks with tickets, a package on a rack and one on a desk.
  const tv = await text(p);
  const admin = (tv.match(/Administration: Backlog \d+, Planning \d+, Review \d+, Done \d+[^\n]*/) ?? [""])[0];
  const floor = (tv.match(/The floor: [^\n]*/) ?? [""])[0];
  ok("rooms: the text view names the racks and the desks", admin !== "" && /at its desk on [A-Z]+-\d+/.test(floor) && /Lead's office: /.test(tv), `${admin} | ${floor.slice(0, 90)}`);
  const onRack = (tv.match(/([A-Z]+-\d+) "[^\n]*; on the (Backlog|Planning|Review|Done) rack\./) ?? [])[0] ?? "";
  const onDesk = (tv.match(/([A-Z]+-\d+) "[^\n]*; on ([^\n;]+)'s desk\./) ?? [])[0] ?? "";
  ok("rooms: a package on a rack and one on a desk", onRack !== "" && onDesk !== "", `${onRack.slice(0, 60)}… | ${onDesk.slice(0, 60)}…`);

  // 19. The lead's office beacon: CL-44 needs attention from 8:00 in the demo script, so the office summary names it.
  ok("seek attention (rooms)", await seek(p, 510000));
  await p.waitForTimeout(1500);
  const tvLater = await text(p);
  const office = (tvLater.match(/Lead's office: [^\n]*beacon: [^\n]*/) ?? [""])[0];
  ok("rooms: the lead's office beacon", office !== "", office.slice(0, 120));

  // 19b. A person carries work into Done (spec addendum "a person in the world"): the storyline's first move into Done
  // by its person (PERSON_DONE_AT in packages/demo/src/script.ts, CR-37 at 3:22); the text view tells the carry, and
  // the scene has a person figure walking it. Sought to 4 s before it, read 12 s later (the move has 1.2 s of jitter).
  const { FIRST_PERSON_DONE_MS } = await import(pathToFileURL(path.join(REPO, "packages", "demo", "src", "script.ts")).href);
  ok("seek person (rooms)", await seek(p, FIRST_PERSON_DONE_MS - 4000));
  await p.waitForTimeout(12000);
  const tvPerson = await text(p);
  const carry = (tvPerson.match(/\S+, a person, (is carrying|is on the way in to carry|moved) [A-Z]+-\d+ to Done[^\n]*/) ?? [""])[0];
  const person = await p.evaluate(() => [...(globalThis.__town?.persons?.persons?.() ?? [])].map((w) => `${w.visit.displayName} ${w.phase}${w.holding ? " holding" : ""}`).join("; ")).catch(() => "");
  ok("rooms: a person carries a package to the Done rack", carry !== "" && /^\S+ (to-package|to-rack|leaving)/.test(person), `${carry.slice(0, 80)} | figure: ${person || "none"}`);
  await shot(p, "27b-rooms-person");
  await p.context().close();

  // 19c. The walkers land after the first drawn frame (TownScene: the navigation graph and the walk runtime follow it
  // in a task of their own, marked world:walks), and every figure must already stand where its walker starts: no
  // figure may move or turn between the first frame, the walkers' arrival and a moment later unless its walker walks.
  // W pressed in the first frame begins walk mode, and a follow asked in the first frame holds (both bring the walkers
  // at once). Each page's figures are read at the marks by a hook on performance.mark set before the page loads.
  for (const action of ["none", "walk", "follow"]) {
    p = await open();
    await p.addInitScript(`(() => {
      const samples = (window.__figures = {});
      const sample = (name) => {
        const t = globalThis.__town;
        if (!t) return;
        const out = {};
        t.scene.traverse((o) => {
          const id = o.userData && o.userData.agentId;
          if (!id || out[id]) return;
          o.updateWorldMatrix(true, false);
          const p = new o.position.constructor();
          o.getWorldPosition(p);
          const w = t.walks.walker(id);
          out[id] = { x: p.x, y: p.y, z: p.z, ry: o.rotation.y, walking: !!(w && w.walking) };
        });
        samples[name] = out;
      };
      window.__sampleFigures = sample;
      const mark = performance.mark.bind(performance);
      performance.mark = (name, ...rest) => {
        const r = mark(name, ...rest);
        if (name === "world:first-frame") {
          sample(name);
          if (${JSON.stringify(action)} === "walk") window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true }));
          if (${JSON.stringify(action)} === "follow") {
            const t = globalThis.__town;
            const agent = t.view.model.buildings.flatMap((b) => b.agents).find((a) => a.presence === "real");
            if (agent) t.follow((window.__followKey = agent.key));
          }
        } else if (name === "world:walks") sample(name);
        return r;
      };
    })();`);
    await town(p, 1500, `${BASE}?rooms=three`);
    await p.evaluate(() => globalThis.__sampleFigures("later"));
    const figures = await p.evaluate(() => globalThis.__figures);
    const first = figures["world:first-frame"] ?? {};
    const moved = [];
    for (const name of ["world:walks", "later"]) {
      for (const [id, f] of Object.entries(figures[name] ?? {})) {
        const before = first[id];
        if (!before) continue;
        const d = Math.hypot(f.x - before.x, f.y - before.y, f.z - before.z);
        if ((d > 1e-3 || Math.abs(f.ry - before.ry) > 1e-3) && !f.walking) moved.push(`${id} ${d.toFixed(3)} at ${name}`);
      }
    }
    const n = Object.keys(first).length;
    const landed = !!figures["world:walks"];
    if (action === "none") ok("rooms: no figure moves when the walkers land after the first frame", n > 0 && landed && moved.length === 0, `${n} figures at the first frame, walkers ${landed ? "landed" : "NOT landed"}; moved ${moved.length}${moved.length ? ": " + moved.slice(0, 5).join(", ") : ""}`);
    else if (action === "walk") {
      const v = await visitor(p);
      ok("rooms: W in the first frame begins walk mode, no figure moves", v !== null && typeof v.room === "string" && moved.length === 0, `visitor ${v ? `in ${v.room}` : "null"}; moved ${moved.length}`);
      await shot(p, "27c-rooms-first-frame-walk");
    } else {
      const f = await p.evaluate(() => ({ asked: window.__followKey ?? null, following: globalThis.__town?.following ?? null }));
      ok("rooms: a follow asked in the first frame holds, no figure moves", f.asked !== null && f.following === f.asked && moved.length === 0, `${f.asked} → ${f.following}; moved ${moved.length}`);
    }
    await p.context().close();
  }

  // 20. The agent card on a figure at a desk: the jump list lands beside the agent with it selected, Enter opens the card,
  // and its Now line says the floor and the desk.
  p = await open();
  await town(p, 2500, `${BASE}?rooms=three`);
  await canvas(p).focus();
  await p.keyboard.press("/");
  const dialog = p.getByRole("dialog", { name: "Jump to" });
  await dialog.waitFor({ timeout: 3000 }).catch(() => {});
  await p.keyboard.type("cr-dev-1");
  await p.waitForTimeout(400);
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(1200);
  await canvas(p).focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(800);
  const card = p.locator(".agent-card");
  const cardText = (await card.innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("rooms: the agent card opens on a figure at a desk", (await card.count()) > 0 && /on the floor at an? \w+ desk/.test(cardText), cardText.slice(0, 120));
  await shot(p, "28-rooms-card");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);

  // 21. Walk mode: W starts on the street before the nearest building; north goes through the front door into
  // Administration (its navigation room is `<slug>/lobby`), then along the racks to the door at administration cell
  // (18, 0) and through it onto the floor (`<slug>/workers`, whose side of that door is cell (9, 17); the stop is the
  // cell beyond it). Each stop is reached by `walkTo`, which steers through the camera's yaw in bounded bursts.
  await canvas(p).focus();
  await p.keyboard.press("w");
  await p.waitForTimeout(800);
  await p.keyboard.down("ArrowUp");
  let inside = null;
  for (let i = 0; i < 120 && !inside; i++) {
    await p.waitForTimeout(100);
    const v = await visitor(p);
    if (v?.building) inside = v;
  }
  await p.keyboard.up("ArrowUp");
  ok("rooms: walk mode enters through the front door into Administration", !!inside && /\/lobby$/.test(inside.room), inside ? `${inside.room} (x ${inside.x.toFixed(1)}, z ${inside.z.toFixed(1)})` : "never entered a building");
  await shot(p, "29-rooms-walk-in");
  let onFloor = null;
  if (inside) {
    const b = inside.building;
    await walkTo(p, { room: `${b}/lobby`, cell: { x: 15, z: 7 } }, 8);
    await walkTo(p, { room: `${b}/lobby`, cell: { x: 18, z: 2 } }, 10);
    await walkTo(p, { room: `${b}/lobby`, cell: { x: 18, z: 0 } }, 6);
    onFloor = await walkTo(p, { room: `${b}/workers`, cell: { x: 9, z: 16 } }, 10);
  }
  ok("rooms: walking on reaches the floor", !!onFloor && /\/workers$/.test(onFloor.room), onFloor ? `${onFloor.room} (x ${onFloor.x.toFixed(2)}, z ${onFloor.z.toFixed(2)}, ${Math.hypot(onFloor.dx, onFloor.dz).toFixed(2)} from the stop)` : "no walk");
  await shot(p, "30-rooms-walk-floor");
  // Round 65 (w1-11): walk mode picks no figure ("nothing is picked while walking"), and a name pill must not start to:
  // a click on one on the floor opens no card and the walk goes on.
  const walkPill = await p.evaluate(() => { for (const el of document.querySelectorAll(".world-labels .agent-anchor .name-pill:not(.person):not(.you-pill)")) { const r = el.getBoundingClientRect(); if (el.closest(".anchor").style.visibility !== "hidden" && r.left > 40 && r.right < innerWidth - 80 && r.top > 120 && r.bottom < innerHeight - 90) return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; } return null; });
  if (walkPill) await p.mouse.click(walkPill.x, walkPill.y);
  await p.waitForTimeout(500);
  const walkCards = await p.locator(".agent-card").count();
  const stillWalking = (await visitor(p)) !== null;
  ok("rooms: in walk mode a click on a name pill opens no card and the walk goes on (round 65, w1-11)", !!walkPill && walkCards === 0 && stillWalking, `pill ${walkPill ? "clicked" : "none on screen"}, ${walkCards} card(s), ${stillWalking ? "walking" : "not walking"}`);
  if (walkCards) {
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
  }
  // Round 33 (teardown c): the walk's key listeners (WalkControls in WorldCanvas.tsx) stand on window while the walk
  // lasts and are gone once Escape ends it.
  ({ listenersOf, close: closeInspector } = await inspector(p));
  const walkKeys = async () => (await listenersOf("window")).filter((l) => /WorldCanvas\.tsx/.test(l.url)).map((l) => l.type).sort();
  const keysWalking = await walkKeys();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(500);
  const keysAfter = await walkKeys();
  ok("rooms (round 33, teardown c): the walk's key listeners stand on window during the walk and none is left once Escape ends it", keysWalking.length > 0 && keysAfter.length === 0, `walking: ${keysWalking.join(", ") || "none"}; after Escape: ${keysAfter.join(", ") || "none"}`);
  await closeInspector();
  await p.context().close();
}
