/**
 * Live mode against the REAL development crewhub-loops named by --loops-env: the host started here with that key, the real
 * projects and tickets in the browser, a ticket move followed, the host over loops' Unix socket, the chat road matching the
 * key. Skips with INFO lines when that loops does not answer.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { openPage, readTextView as text, textView as sheet } from "../lib/page.mjs";
import { list } from "../lib/world.mjs";
import { startRig } from "../lib/rig.mjs";
import { ownAppData, ownLoopsUrl } from "../lib/toolGuard.ts";

export async function run({ pass, page, check, out }) {
  const { browser, opts, plan, origin, base: BASE, problems, noteLoopsUrl, loopsEnvFile, loopsSocketPath, readEnvFile, isUnixSocket, waitForMove } = pass;
  const { open, town, canvas, entered } = page;
  const { ok, info } = check;
  const { tag, shot } = out;
  // 22. Live mode against the real development crewhub-loops: the env file names it and the key file; the host is
  // started here, on --host-port, with that key; the browser opens your Vite (started with CREWHUB_WORLD_PORT).
  const envFile = loopsEnvFile();
  const env = readEnvFile(envFile);
  const loopsUrl = (env.LOOPS_DEV_URL ?? "").replace(/\/+$/, "");
    noteLoopsUrl(loopsUrl);
  const keyFile = env.LOOPS_DEV_KEY_FILE ?? "";
  const parsed = (() => {
    try {
      return new URL(loopsUrl);
    } catch {
      return null;
    }
  })();
  // This machine only: the development loops is loopback, as every address a tool opens.
  const loopback = parsed !== null && parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.port !== "";
  if (!loopback || keyFile === "") {
    info(`real: skipped, no loopback LOOPS_DEV_URL and LOOPS_DEV_KEY_FILE in ${envFile}`);
    return;
  }
  // Never the Mac app's port nor 5180, even when the env file names it (a typo of 8291 is 8091). `real` is the
  // development loops' opt-in (round 57d, §5b.4): this group runs only when real is in --groups.
  const urlVerdict = ownLoopsUrl(loopsUrl, { real: plan.real });
  if (!urlVerdict.ok) opts.fail(`${envFile}: LOOPS_DEV_URL ${urlVerdict.reason}`);
  const loopsPort = parsed.port;
  // Every read of this group goes through the browser's request context (a tool makes no network call of its own).
  const pg = await openPage(browser, { origin, problems, tag: "real" });
  const ctx = pg.context();
  const health = await pg.request.get(`${loopsUrl}/api/health`, { timeout: 2000 }).then((r) => (r.ok() ? r.json() : null)).catch(() => null);
  if (!health?.ok) {
    info(`real: skipped, ${loopsPort} is down`);
    await ctx.close();
    return;
  }
  let key = "";
  try {
    key = readFileSync(keyFile, "utf8").trim();
  } catch {}
  if (key === "") {
    info(`real: skipped, cannot read the key file named by ${envFile}`);
    await ctx.close();
    return;
  }
  const hostPort = Number(opts["host-port"]);
  if (!Number.isInteger(hostPort) || hostPort <= 0) opts.fail("--host-port <port> must be a port number");
  const keyName = path.basename(keyFile).replace(/^agent-/, "").replace(/\.key$/, "");
  // The rig (lib/rig.mjs) over the real loops: the host behind your Vite with the key, pairing off, a slow retry (the
  // key's verdict is loops' own); the socket host below is a second rig over the same loops and key.
  const rigOptions = { loops: { url: loopsUrl, key, keyName }, pairing: "off", timings: { retryMs: { min: 200, max: 2000 } }, log: () => undefined };
  const rig = await startRig({ ...rigOptions, serve: { origin, hostPort } });
  const { host } = rig;
  info(`real: loops on 127.0.0.1:${loopsPort} (version ${health.version}), host on 127.0.0.1:${host.port} behind the Vite proxy on ${origin}, key ${keyName}`);
  // The host's answers through the Vite proxy, as the page reads them.
  const hostApi = (p) => pg.request.get(`${origin}/world-api${p}`).then((r) => r.json());
  const chip = pg.locator(".connection-chip").first();
  let tcpProjects = -1;
  try {
    const snapshot = await hostApi("/snapshot");
    tcpProjects = Array.isArray(snapshot.projects) ? snapshot.projects.length : -1;
    ok("real: the host assembles a snapshot from the real loops", Array.isArray(snapshot.projects) && snapshot.projects.length > 0 && typeof snapshot.cursor === "number", `cursor ${snapshot.cursor}, ${snapshot.projects?.length} projects`);
    const projects = snapshot.projects ?? [];
    const names = projects.map((p) => `${p.name} (${p.key})`);
    await pg.goto(BASE);
    await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    await pg.waitForSelector('.connection-chip[data-connection="live"]', { timeout: 20000 }).catch(() => {});
    const state = await chip.getAttribute("data-connection").catch(() => null);
    ok("real: the chip says Live against the real loops", state === "live", `${state}: ${(await chip.innerText().catch(() => "")).trim()}`);
    await shot(pg, "31-real-town");
    const tv = await text(pg);
    ok("real: the town shows the real projects by name", names.length > 0 && names.every((n) => tv.includes(n)) && !/Demo mode/.test(tv), `${names.join(", ")}${names.every((n) => tv.includes(n)) ? "" : " | " + tv.slice(0, 160).replace(/\n/g, " | ")}`);
    // Round 9: the facts the log holds come with the snapshot, so a fresh tab shows the dust of a quiet ticket and
    // the last runs' lines; skipped with an INFO line when this loops has none open right now.
    const carriedQuiet = Array.isArray(snapshot.quiet) ? snapshot.quiet : [];
    const carriedRuns = Array.isArray(snapshot.automationRuns) ? snapshot.automationRuns : [];
    if (carriedQuiet.length > 0) ok("real: a fresh tab shows the dust of the quiet tickets the host read from the log", carriedQuiet.every((e) => new RegExp(`${e.ticket?.key} has been quiet in `).test(tv)), carriedQuiet.map((e) => `${e.ticket?.key} ${e.payload?.minutes} min`).join(", "));
    else info("real: no open quiet stretch on this loops right now, the dust check is skipped");
    if (carriedRuns.length > 0) ok("real: a fresh tab lists the last automation runs the host read from the log", carriedRuns.slice(-3).every((e) => tv.includes(`ran on ${e.ticket?.key}: `)), carriedRuns.slice(-3).map((e) => `${e.ticket?.key} ${e.payload?.outcome}`).join(", "));
    else info("real: no automation run on an open ticket on this loops, the run lines check is skipped");
    // The building with the most tickets: its real tickets, by key, in the text view and in the scene.
    const withBoard = projects.map((p) => ({ p, keys: (snapshot.boards?.[p.slug]?.columns ?? []).flatMap((c) => c.tickets.map((t) => t.key)) })).sort((a, b) => b.keys.length - a.keys.length)[0];
    if (withBoard && withBoard.keys.length > 0) {
      await canvas(pg).focus();
      await pg.keyboard.press("/");
      const dialog = pg.getByRole("dialog", { name: "Jump to" });
      await dialog.waitFor({ timeout: 3000 }).catch(() => {});
      await pg.keyboard.type(withBoard.p.name);
      await pg.waitForTimeout(400);
      await pg.keyboard.press("Enter");
      await pg.waitForFunction(() => globalThis.__town?.view?.entered != null, null, { timeout: 8000 }).catch(() => {});
      await pg.waitForTimeout(1200);
      const inside = await entered(pg);
      const tvInside = await text(pg);
      const named = withBoard.keys.filter((k) => tvInside.includes(k));
      ok("real: a building shows its real tickets and the text view names them", inside === withBoard.p.slug && named.length === withBoard.keys.length, `${inside}: ${named.length}/${withBoard.keys.length} of ${withBoard.keys.join(", ")}`);
      await shot(pg, "32-real-building");
      // A move during the run (the seed tool or a person): the building's count follows the board within the budget.
      // The racks are read between two board reads that agree, so a board that moves meanwhile (a fast seed) is read again.
      const moved = await waitForMove(hostApi, withBoard.p.slug, 15000);
      if (moved === null) info("real: no ticket moved during the run, the count check is skipped (run tools/loops-seed.mjs alongside to see it)");
      else {
        await pg.waitForTimeout(1500);
        const rackCounts = async () => {
          const board = await hostApi(`/board/${encodeURIComponent(moved.slug)}`);
          const by = Object.fromEntries((board.columns ?? []).map((c) => [c.status, c.tickets.length]));
          return ["backlog", "planned", "review", "done"].map((k) => by[k] ?? 0);
        };
        // A moved ticket flies to its new rack first (world-model flights, a few seconds at real time), so the racks are
        // given up to 12 s to agree with a board that stands still.
        let racks = [];
        let board = [];
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const before = await rackCounts();
          const tvMoved = await text(pg);
          racks = (tvMoved.match(/Administration: Backlog (\d+), Planning (\d+), Review (\d+), Done (\d+)/) ?? []).slice(1).map(Number);
          board = await rackCounts();
          if (before.join("/") === board.join("/") && racks.join("/") === board.join("/")) break;
          await pg.waitForTimeout(1000);
        }
        ok("real: after a ticket moved, the building's counts follow the board", racks.length === 4 && racks.join("/") === board.join("/"), `${moved.key} ${moved.from} → ${moved.to}; racks ${racks.join("/")} vs board ${board.join("/")}`);
        await shot(pg, "33-real-moved");
      }
    } else info("real: no project has tickets, the building checks are skipped");
    const after = await hostApi("/health");
    ok("real: the host stayed on the real loops", after.loops === "ok" && typeof after.cursor === "number" && after.cursor >= snapshot.cursor, `loops ${after.loops}, cursor ${snapshot.cursor} → ${after.cursor}`);
    // Round 7: loops' version as that loops' own health says it, in the host's health and in the panel (what 8291 can
    // show without being stopped; the stop/start, revoke and upgrade roads are the ops group's, over the fake).
    await chip.click();
    await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
    const facts = (await pg.locator(".connection-facts").innerText().catch(() => "")).replace(/\s+/g, " ");
    const road = await pg.locator(".connection-chat").getAttribute("data-road").catch(() => null);
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(200);
    // Round 29: the chat road and the archive source match the key: a viewer key (crewhub-loops main, --loops main)
    // reads the chat (session key, the Chat section on the key road) and lists the archived projects (includeArchived
    // answers 200 for a viewer, #965); a plain external bot's key reads no chat and the archive comes from the log.
    const viewer = after.connection?.session?.state === "key";
    const archivedSource = after.connection?.archived?.source;
    ok(
      `real: the chat road and the archive source match the key: ${viewer ? "a viewer key reads the chat (session key, the Chat section on the key road) and lists the archived projects" : "a plain external bot's key reads no chat (no session, the Chat section on no road) and the archived projects come from the log"}`,
      viewer ? road === "key" && archivedSource === "list" : after.connection?.session === undefined && road === "none" && ["log", "remembered", "none"].includes(archivedSource),
      `key ${keyName}: session ${JSON.stringify(after.connection?.session)}, data-road ${road}, archived from ${archivedSource} (${after.connection?.archived?.count})`,
    );
    ok("real: the host reports loops' version as its health says it, with no earlier version, and the panel names it", after.loopsCommit === health.version && after.loopsCommitBefore === undefined && facts.includes(`crewhub-loops version ${health.version}`), `${after.loopsCommit} (loops says ${health.version}); panel: ${facts.replace(/.*crewhub-loops version/, "crewhub-loops version").slice(0, 80)}`);
  } finally {
    await rig.close();
  }
  // The socket: with the TCP host closed (one upstream stream of this key at a time), a second host reads the same
  // loops over its Unix socket (CREWHUB_WORLD_LOOPS_SOCKET): the same key, the same projects, `transport: "unix"`.
  const socketPath = loopsSocketPath();
  // A development loops' socket, never the Mac app's (its data folder holds run/api.sock).
  const socketVerdict = ownAppData(socketPath, process.env.HOME ?? "~");
  if (!socketVerdict.ok) opts.fail(`--loops-socket: ${socketVerdict.reason}`);
  let unixRig = null;
  try {
    if (!isUnixSocket(socketPath)) {
      info(`real: socket check skipped, no Unix socket at ${socketPath} (--loops-socket names another)`);
      return;
    }
    unixRig = await startRig({ ...rigOptions, serve: { hostPort: 0 }, host: { loopsSocket: socketPath } });
    const unixHost = unixRig.host;
    key = "";
    const unixApi = (p) => pg.request.get(`${unixHost.url}/world-api${p}`).then((r) => r.json());
    let unixHealth = await unixApi("/health");
    for (let attempt = 0; attempt < 25 && unixHealth.loops !== "ok"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      unixHealth = await unixApi("/health");
    }
    ok("real: a host over the Unix socket reads the same loops", unixHealth.transport === "unix" && unixHealth.loops === "ok" && typeof unixHealth.cursor === "number", `transport ${unixHealth.transport}, loops ${unixHealth.loops}, cursor ${unixHealth.cursor}, socket ${socketPath}`);
    const unixSnapshot = await unixApi("/snapshot");
    const unixProjects = Array.isArray(unixSnapshot.projects) ? unixSnapshot.projects.length : -1;
    ok("real: the socket host's snapshot has the projects the TCP host had", unixProjects > 0 && unixProjects === tcpProjects, `${unixProjects} over the socket, ${tcpProjects} over TCP`);
  } finally {
    key = "";
    if (unixRig !== null) await unixRig.close();
    await ctx.close().catch(() => {});
  }
}
