/**
 * The world database behind the host (round 20): two paired browsers on one host, an undo seen in the other, a redo after a
 * host restart, an import's preview, and (round 54) a prop request whose first ticket read answers 503.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openPage, readTextView as text, textView as sheet } from "../lib/page.mjs";
import { hostGet, pairedTab } from "../lib/world.mjs";
import { startRig } from "../lib/rig.mjs";

export async function run({ pass, page, check, out }) {
  const { browser, opts, origin, repo: REPO, dist: DIST, problems, restarts, noteLoops } = pass;
  const { town, canvas } = page;
  const { ok, info, note } = check;
  const { dir: OUT, tag, shot } = out;
  // The world database (round 20): the host keeps the live town per installation in world.db. Two paired browsers on one
  // host see one town (a zone made in one appears in the other through the stream's `town` message); a host restart on
  // the same database keeps it; a browser with an older town of its own imports it once into a host that has none.
  const { openWorldDb } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "worldDb.ts")).href);
  const hostPort = Number(opts["host-port"]);
  // One pairing secret for every host of this group, so a restart keeps the browsers paired; two databases: the first
  // host's, left behind, and the one the rest of the group runs on.
  const pairingSecret = randomBytes(32);
  // Under --out, fresh for this run and removed at its end, as the ops group's config folder (review F9: two folders a
  // run were left in $TMPDIR).
  const dbDirs = ["a", "b"].map((side) => path.join(OUT, `${tag}-town-${side}`));
  for (const dir of dbDirs) rmSync(dir, { recursive: true, force: true });
  const dbs = dbDirs.map((dir) => openWorldDb(dir));
  // The rig (lib/rig.mjs): the fake, the host on the first database with the group's secret (serving the built world
  // when it is there, else behind your Vite); `start` is the next host on another database, on the same port while
  // the host serves (the rig closes the one standing first); the host's lines are the rig's.
  const rig = await startRig({ loops: { fake: { heartbeatMs: 1000 } }, serve: { dist: DIST, origin, hostPort }, pairing: { secret: pairingSecret }, host: { worldDb: dbs[0] }, onLoops: noteLoops });
  const { fake, served } = rig;
  const hostLog = rig.lines;
  const start = (worldDb) => rig.restart({ worldDb });
  let host = rig.host;
  const port = host.port;
  const liveOrigin = served ? host.url : origin;
  /**
   * Closes the host and starts the next on the same port with `worldDb`, and notes the window in `restarts`: from just
   * before the close to the moment the new host listens. The town's open pages read `/world-api/health` when their
   * stream drops (state/health.ts re-reads on the stream's word), and a read inside that window is refused: the
   * browser prints it as a console error, which the closing check admits there and nowhere else.
   */
  const restartHost = async (worldDb) => {
    const from = Date.now();
    await host.close();
    host = await start(worldDb, port);
    restarts.push({ origin: liveOrigin, tag: "town", from, to: Date.now() });
  };
  const liveBase = `${liveOrigin}/`;
  info(`town: fake on 127.0.0.1:${fake.port}, host on 127.0.0.1:${port} ${served ? "serving apps/world/dist" : `behind the Vite proxy on ${origin}`}; databases ${dbs.map((d) => d.file).join(" and ")}`);
  const contexts = [];
  const openPaired = async () => {
    const pg = await openPage(browser, { origin: liveOrigin, problems, tag: "town" });
    contexts.push(pg.context());
    // The town store's own log lines (`[town] …`), for the detail of a failed check.
    pg.townLog = [];
    pg.on("console", (m) => {
      if (/\[town\]/.test(m.text())) pg.townLog.push(m.text().replace("[town] ", ""));
    });
    if (typeof host.mintPairLink === "function") {
      await pg.goto(host.mintPairLink(served ? undefined : origin));
      await pairedTab(pg).catch(() => {});
    }
    await pg.goto(liveBase);
    await pg.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    return pg;
  };
  const zoneLines = async (pg) => (await text(pg)).split("\n").filter((l) => /^Zone \d+ \(/.test(l));
  const townRow = async (pg) => {
    await pg.locator(".connection-chip").first().click().catch(() => {});
    await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
    const row = (await pg.locator(".connection-town").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(200);
    return row;
  };
  const addZone = async (pg) => {
    await canvas(pg).focus();
    await pg.keyboard.press("b");
    await pg.waitForTimeout(800);
    await pg.locator(".build-sheet").getByRole("button", { name: "Add a zone" }).click();
    await pg.waitForTimeout(800);
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(400);
  };
  const hostTown = async (pg) => {
    const r = await hostGet(pg, `${liveOrigin}/world-api/town`).catch(() => null);
    const body = r ? await r.json().catch(() => null) : null;
    return { status: r ? r.status() : 0, rev: body?.rev ?? null, zones: (body?.document?.zones ?? []).map((z) => z.id) };
  };
  /**
   * Waits for a browser to show the host's revision (round 22: state, never time): the page keeps the revision it is on
   * in `<html data-town-rev>`; `min` left out means the revision the host has now. Answers the revision the page shows.
   */
  const atRev = async (pg, min = null, timeout = 15000) => {
    const wanted = min ?? (await hostTown(pg)).rev ?? 0;
    await pg.waitForFunction((w) => Number(document.documentElement.dataset.townRev ?? -1) >= w, wanted, { timeout }).catch(() => {});
    return Number(await pg.evaluate(() => document.documentElement.dataset.townRev ?? "-1"));
  };
  try {
    // 1. A first browser on a host whose database is empty: its empty town goes up once, a zone made here is the host's.
    const first = await openPaired();
    const before = await townRow(first);
    await addZone(first);
    await atRev(first);
    const made = await hostTown(first);
    ok("town: the Connection panel says the host keeps the town, and a zone made here is on the host", /^Kept by the world's host for this crewhub-loops, shared by every paired browser\./.test(before) && made.status === 200 && made.zones.includes("zone-1"), `${before.slice(0, 90)} | host: ${made.status} rev ${made.rev} zones ${made.zones.join(",")}`);
    await shot(first, "31-town-host");

    // 2. The host goes away and comes back on the same port with a database that has no town: the browser's own town
    // (kept in IndexedDB under the installation's key) is imported once, and the host now has the zone.
    await restartHost(dbs[1]);
    await first.reload();
    await first.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await atRev(first, 1);
    const imported = await hostTown(first);
    const note = await townRow(first);
    ok("town: a browser with an older town of its own imports it once into a host that has none", imported.status === 200 && imported.rev === 1 && imported.zones.includes("zone-1") && /sent to the world's host once/.test(note), `host: ${imported.status} rev ${imported.rev} zones ${imported.zones.join(",")} | ${note.slice(0, 120)}`);

    // 3. A second paired browser sees the same town; a zone made there reaches the first through the stream.
    const second = await openPaired();
    await atRev(second);
    const seenBySecond = await zoneLines(second);
    await addZone(second);
    await atRev(second);
    const again = await hostTown(second);
    await atRev(first, again.rev);
    const seenByFirst = await zoneLines(first);
    const pair = seenBySecond.some((l) => l.startsWith("Zone 1 (")) && seenByFirst.some((l) => l.startsWith("Zone 2 (")) && /kept by the world's host/.test(seenByFirst.join(" ")) && again.rev >= 2;
    ok("town: two browsers on one host see one town; a zone made in one appears in the other", pair, `second saw ${seenBySecond.length} zone line(s); first now ${seenByFirst.map((l) => l.slice(0, 7)).join(", ")}; host rev ${again.rev}`);
    if (!pair) {
      info(`town: the second browser's town log: ${second.townLog.slice(-20).join(" | ") || "(nothing)"}`);
      info(`town: the first browser's town log: ${first.townLog.slice(-20).join(" | ") || "(nothing)"}`);
      info(`town: the second browser's page revision ${await second.evaluate(() => document.documentElement.dataset.townRev ?? "none")}, storage words: ${(await second.locator(".connection-town").innerText().catch(() => "")).slice(0, 120)}`);
      info(`town: the host's log: ${hostLog.filter((l) => /town of/.test(l)).join(" | ")}`);
      const { DatabaseSync } = await import("node:sqlite");
      const peek = new DatabaseSync(dbs[1].file, { readOnly: true });
      const rows = peek.prepare("SELECT installation, rev, history FROM towns").all();
      peek.close();
      for (const row of rows) {
        const h = JSON.parse(row.history ?? "null");
        info(`town: the host's history of ${row.installation} at rev ${row.rev}: index ${h?.index}, entries ${(h?.entries ?? []).map((e) => `r${e.revision}[${(e.zones ?? []).map((z) => z.id).join(",")}|plots ${e.plots.length}]`).join(" ")}`);
      }
    }
    await shot(second, "32-town-second");

    // 4. A host restart on the same database keeps the town.
    await restartHost(dbs[1]);
    await first.reload();
    await first.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await atRev(first);
    const kept = await zoneLines(first);
    const row = await townRow(first);
    ok("town: a host restart keeps the town", kept.some((l) => l.startsWith("Zone 1 (")) && kept.some((l) => l.startsWith("Zone 2 (")) && /^Kept by the world's host/.test(row), `${kept.map((l) => l.slice(0, 7)).join(", ")} | ${row.slice(0, 80)}`);
    await shot(first, "33-town-restart");

    // 5. Round 21: the undo history is the host's. An undo in the second browser (build mode, Ctrl+Z) takes Zone 2 away
    // in the first too; after a host restart the first browser redoes it (the history came back with the database) and
    // the second sees Zone 2 again.
    await second.reload();
    await second.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await atRev(second);
    await canvas(second).focus();
    await second.keyboard.press("b");
    await second.waitForTimeout(800);
    const revBeforeUndo = (await hostTown(second)).rev;
    await second.locator(".build-sheet").getByRole("button", { name: "Undo", exact: true }).click();
    await atRev(second, revBeforeUndo + 1);
    await second.keyboard.press("Escape");
    await atRev(first, revBeforeUndo + 1);
    const afterUndo = await zoneLines(first);
    await restartHost(dbs[1]);
    await first.reload();
    await first.waitForSelector(".connection-chip[data-connection=\"live\"]", { timeout: 30000 }).catch(() => {});
    await atRev(first);
    await canvas(first).focus();
    await first.keyboard.press("b");
    await first.waitForTimeout(800);
    const redoButton = first.locator(".build-sheet").getByRole("button", { name: "Redo", exact: true });
    const redoEnabled = await redoButton.isEnabled().catch(() => false);
    const revBeforeRedo = (await hostTown(first)).rev;
    if (redoEnabled) await redoButton.click();
    await atRev(first, revBeforeRedo + 1);
    await first.keyboard.press("Escape");
    await atRev(second, revBeforeRedo + 1);
    const afterRedo = await zoneLines(second);
    ok(
      "town: an undo in one browser is seen in the other, and a redo after a host restart brings it back for both",
      !afterUndo.some((l) => l.startsWith("Zone 2 (")) && afterUndo.some((l) => l.startsWith("Zone 1 (")) && redoEnabled && afterRedo.some((l) => l.startsWith("Zone 2 (")),
      `after undo: ${afterUndo.map((l) => l.slice(0, 7)).join(", ") || "none"}; redo offered after the restart: ${redoEnabled}; after redo the second sees ${afterRedo.map((l) => l.slice(0, 7)).join(", ")}`,
    );
    if (afterUndo.some((l) => l.startsWith("Zone 2 (")) || !redoEnabled || !afterRedo.some((l) => l.startsWith("Zone 2 ("))) {
      // The undo check failed: the host's revision and its last history entries, and both browsers' town logs, as the
      // two-browser check prints them (r27-townback: an identical revision sent on a come-back was found this way).
      info(`town: undo detail: rev before the undo ${revBeforeUndo}, the host now ${JSON.stringify(await hostTown(second))}; the second's town log: ${second.townLog.slice(-20).join(" | ") || "(nothing)"}; the first's: ${first.townLog.slice(-20).join(" | ") || "(nothing)"}`);
      info(`town: the host's log: ${hostLog.slice(-12).join(" | ")}`);
      const { DatabaseSync } = await import("node:sqlite");
      const peek = new DatabaseSync(dbs[1].file, { readOnly: true });
      const rows = peek.prepare("SELECT installation, rev, updated_by, history FROM towns").all();
      peek.close();
      for (const row of rows) {
        const h = JSON.parse(row.history ?? "null");
        for (const e of (h?.entries ?? []).slice(-2)) info(`town: entry r${e.revision}: ${JSON.stringify(e).slice(0, 1600)}`);
        info(`town: the host's history of ${row.installation} at rev ${row.rev} (by ${row.updated_by}): index ${h?.index}, entries ${(h?.entries ?? []).map((e) => `r${e.revision}[zones ${(e.zones ?? []).map((z) => z.id).join(",")}; placements ${(e.placements ?? []).length}; plots ${(e.plots ?? []).length}]`).join(" ")}`);
      }
    }
    await shot(first, "34-town-redo");

    // 6. A restore is previewed and confirmed, never silent: a town file with Zone 1 renamed is imported in Settings >
    // Town; the preview names the rename; Cancel changes nothing; the same import confirmed renames it on the host.
    const current = await hostGet(first, `${liveOrigin}/world-api/town`).then((r) => r.json()).catch(() => null);
    const renamed = JSON.parse(JSON.stringify(current.document));
    for (const z of renamed.zones ?? []) if (z.id === "zone-1") z.name = "Harbour";
    const file = { name: "harbour.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(renamed)) };
    const openSettings = async (pg) => {
      await pg.getByRole("button", { name: "Settings", exact: true }).click();
      await pg.waitForSelector(".settings-sheet", { timeout: 5000 });
    };
    await openSettings(first);
    await first.locator('.settings-sheet input[type="file"]').setInputFiles(file);
    await first.waitForSelector(".restore-sheet", { timeout: 5000 }).catch(() => {});
    const previewText = (await first.locator(".restore-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    const focused = await first.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    await first.keyboard.press("Escape");
    await first.waitForTimeout(500);
    const dialogGone = (await first.locator(".restore-sheet").count()) === 0;
    const revAfterCancel = (await hostGet(first, `${liveOrigin}/world-api/town`).then((r) => r.json()).catch(() => null))?.rev;
    ok(
      "town: an import opens a preview that names the change, with the focus inside; Escape cancels and nothing changes",
      /renamed "Harbour"/.test(previewText) && /1 change\./.test(previewText) && focused === "Cancel" && dialogGone && revAfterCancel === current.rev,
      `${previewText.slice(0, 120)} | focus on "${focused}" | rev ${current.rev} → ${revAfterCancel}`,
    );
    await first.locator('.settings-sheet input[type="file"]').setInputFiles(file);
    await first.waitForSelector(".restore-sheet", { timeout: 5000 }).catch(() => {});
    await shot(first, "35-town-restore-preview");
    await first.locator(".restore-sheet").getByRole("button", { name: "Restore", exact: true }).click();
    await atRev(first, current.rev + 1);
    const afterRestore = await hostGet(first, `${liveOrigin}/world-api/town`).then((r) => r.json()).catch(() => null);
    const restoreNote = (await first.locator(".settings-sheet").innerText().catch(() => "")).replace(/\s+/g, " ");
    await first.keyboard.press("Escape");
    await atRev(second, current.rev + 1);
    // The renamed zone no longer matches the "Zone n" filter: every hand-made zone line of the second browser is read.
    const secondSees = (await text(second)).split("\n").filter((l) => /\(made by hand/.test(l));
    ok(
      "town: the confirmed restore is the next revision on the host, named Harbour in the other browser too, and Undo is offered",
      afterRestore?.rev === current.rev + 1 && (afterRestore?.document?.zones ?? []).some((z) => z.name === "Harbour") && afterRestore?.canUndo === true && /Restored from harbour\.json/.test(restoreNote) && secondSees.some((l) => l.startsWith("Harbour (")),
      `rev ${current.rev} → ${afterRestore?.rev}; canUndo ${afterRestore?.canUndo}; second sees ${secondSees.map((l) => l.slice(0, 9)).join(", ")}`,
    );

    // Round 54 (r53-review S3): a prop request whose ticket read failed is tried again after PROP_RETRY_MS (30 s), not
    // never. A fake of its own starts 20 s before the reading nook's Done (CR-37, the storyline's first person's Done);
    // the page's first read of the ticket answers 503, as the host does while loops restarts; the prop then reaches the
    // host's town on the retry, about 30 s later. The expected 503 line is the one console error this step admits.
    for (const ctx of contexts.splice(0)) await ctx.close().catch(() => {});
    await host.close();
    const { FIRST_PERSON_DONE_MS } = await import(pathToFileURL(path.join(REPO, "packages", "demo", "src", "script.ts")).href);
    const propFake = await rig.loopsAgain({ heartbeatMs: 1000, startAt: FIRST_PERSON_DONE_MS - 20_000 });
    const propDir = path.join(OUT, `${tag}-town-c`);
    rmSync(propDir, { recursive: true, force: true });
    dbDirs.push(propDir);
    const propDb = openWorldDb(propDir);
    dbs.push(propDb);
    try {
      host = await rig.restart({ loopsUrl: propFake.url, key: propFake.key, keyName: propFake.keyName, worldDb: propDb });
      const own = [];
      const pg = await openPage(browser, { origin: liveOrigin, problems: own, tag: "town" });
      contexts.push(pg.context());
      const reads = [];
      await pg.route("**/world-api/tickets/CR-37", async (route) => {
        reads.push(Date.now());
        if (reads.length === 1) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "loops_down" }) });
        else await route.continue();
      });
      if (typeof host.mintPairLink === "function") {
        await pg.goto(host.mintPairLink(served ? undefined : origin));
        await pg.waitForTimeout(300);
      }
      await pg.goto(liveBase);
      const propOnHost = async () => {
        const body = await pg.request.get(`${liveOrigin}/world-api/town`).then((r) => r.json()).catch(() => null);
        return (body?.document?.userProps ?? []).some((prop) => prop.provenance?.kind === "ticket" && prop.provenance.ticketKey === "CR-37");
      };
      const until = async (test, ms) => {
        for (const end = Date.now() + ms; Date.now() < end; await pg.waitForTimeout(500)) if (await test()) return true;
        return false;
      };
      await until(async () => reads.length >= 1, 45_000);
      const failedAt = reads[0] ?? null;
      const arrived = failedAt !== null && (await until(propOnHost, 50_000));
      const gap = arrived ? Math.round((Date.now() - failedAt) / 1000) : null;
      ok(
        "town (round 54): a prop request whose ticket read answered 503 is tried again after about 30 s, and the prop reaches the host's town",
        failedAt !== null && reads.length >= 2 && arrived && gap >= 25,
        `ticket reads ${reads.length} (the first answered 503${reads.length >= 2 ? `, the second ${Math.round((reads[1] - reads[0]) / 1000)} s later` : ""}); CR-37's prop on the host: ${arrived ? `yes, ${gap} s after the 503` : "no"}`,
      );
      problems.push(...own.filter((x) => !(x.kind === "console" && /status of 503/.test(x.text) && /\/world-api\/tickets\/CR-37$/.test(x.url ?? ""))));
    } finally {
      await propFake.close().catch(() => {});
    }
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await rig.close();
    await fake.close().catch(() => {});
    for (const db of dbs) db.close();
    for (const dir of dbDirs) rmSync(dir, { recursive: true, force: true });
  }
}
