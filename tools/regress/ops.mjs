/**
 * The live operations road (round 7): the fake closed and reopened on its port, reopened with another key (the host's key
 * revoked while Live, a new one pasted), and reopened with another health version (loops upgraded), under a host started here.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openPage, screenShown, textView as sheet } from "../lib/page.mjs";
import { startRig } from "../lib/rig.mjs";

export async function run({ pass, page, check, out }) {
  const { browser, opts, origin, repo: REPO, dist: DIST, distServed: DIST_SERVED, distFresh, problems, noteLoops } = pass;
  const { town, canvas } = page;
  const { ok, info } = check;
  const { dir: OUT, tag, shot } = out;
  // 16. The live operations road (round 7): loops stopped and started, the key revoked while Live and another pasted,
  // loops upgraded (another health version), each under a running host over the fake, each with its honest screen.
  // The host listens on --host-port behind your Vite; the fake is reopened on its own port for every act.
  const { createKeyStore } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "keyStore.ts")).href);
  // As the live group (the rig, lib/rig.mjs): with apps/world/dist built the host serves it on a free port and the
  // browser opens the host directly (no port of yours is taken); otherwise the host listens on --host-port behind your Vite.
  const hostPort = Number(opts["host-port"]);
  if (DIST_SERVED) info(`ops: ${distFresh}`);
  const configDir = path.join(OUT, `${tag}-ops-config`);
  rmSync(configDir, { recursive: true, force: true });
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const store = createKeyStore(configDir);
  const fakeOptions = { heartbeatMs: 1000, version: "0.1.0+fake.ops" };
  const rig = await startRig({ loops: { fake: fakeOptions }, serve: { dist: DIST, origin, hostPort }, pairing: "off", host: { keySource: "stored", keyStore: store }, log: () => undefined, onLoops: noteLoops });
  const { served, host } = rig;
  let { fake } = rig;
  const { port, keyName } = fake;
  const firstKey = fake.key;
  let lastSeq = fake.lastSeq();
  const opsOrigin = rig.origin;
  const opsBase = `${opsOrigin}/`;
  info(`ops: fake on 127.0.0.1:${port}, host on 127.0.0.1:${host.port} ${served ? "serving apps/world/dist" : `behind the Vite proxy on ${origin} (Vite started with CREWHUB_WORLD_PORT=${hostPort})`}, the key store under ${configDir}`);
  const own = [];
  const pg = await openPage(browser, { origin: opsOrigin, problems: own, tag: "ops" });
  const ctx = pg.context();
  const chip = pg.locator(".connection-chip").first();
  const chipState = () => chip.getAttribute("data-connection").catch(() => null);
  const until = async (wanted, timeout) => {
    await pg.waitForSelector(`.connection-chip[data-connection="${wanted}"]`, { timeout }).catch(() => {});
    return chipState();
  };
  const screen = (which, timeout) => screenShown(pg, which, timeout);
  const hostApi = (p) => pg.request.get(`${opsOrigin}/world-api${p}`).then((r) => r.json());
  /**
   * Opens the Connection panel, waits until its facts (one line) satisfy `wanted` (the panel asks the host when it
   * opens and on every state change, then every 5 s: up to its poll and a margin), closes it with Escape and
   * answers the facts as last read.
   */
  const panelFacts = async (wanted = () => true) => {
    await chip.click();
    await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
    let facts = "";
    const deadline = Date.now() + 8000;
    for (;;) {
      facts = (await pg.locator(".connection-facts").innerText().catch(() => "")).replace(/\s+/g, " ");
      if (wanted(facts) || Date.now() > deadline) break;
      await pg.waitForTimeout(250);
    }
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(200);
    return facts;
  };
  const mark = () => pg.evaluate(() => ((globalThis.__opsMarker = "set"), undefined));
  const marked = () => pg.evaluate(() => globalThis.__opsMarker ?? null).catch(() => null);
  const leaked = async (key) => {
    const part = key.slice(4, 24);
    const html = await pg.content();
    const stored = await pg.evaluate(() => JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage))).catch(() => "");
    return html.includes(part) || stored.includes(part) || pg.url().includes(part);
  };
  /** Polls the host's health until `test` holds, for `ms`; answers the last health read. */
  const healthUntil = async (test, ms) => {
    const deadline = Date.now() + ms;
    let h = await hostApi("/health").catch(() => null);
    while (!(h && test(h)) && Date.now() < deadline) {
      await pg.waitForTimeout(500);
      h = await hostApi("/health").catch(() => null);
    }
    return h;
  };
  try {
    await pg.goto(opsBase);
    await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
    const live0 = await until("live", 20000);
    ok("ops: Live over the fake before anything happens", live0 === "live", `${live0}`);
    await mark();

    // (a) loops stops and starts under the host.
    lastSeq = fake.lastSeq();
    await fake.close();
    const down = await until("loops-down", 20000);
    const factsDown = await panelFacts((f) => /down; the host retries/.test(f));
    ok("ops (a): loops stopped under the host: the Loops down chip over the last known town, the panel says the stream is down and the host retries, the key still accepted", down === "loops-down" && /down; the host retries/.test(factsDown) && /accepted/.test(factsDown), `${down}; ${factsDown.slice(0, 160)}`);
    await shot(pg, "47-ops-loops-stopped");
    fake = await rig.loopsAgain({ ...fakeOptions, port, key: firstKey, keyName, firstSeq: lastSeq });
    const back = await until("live", 30000);
    const healthBack = await healthUntil((h) => h.loops === "ok" && typeof h.cursor === "number", 10000);
    ok("ops (a): loops started again: Live without a reload, the key still accepted, the cursor goes on", back === "live" && (await marked()) === "set" && healthBack?.connection?.key?.state === "ok" && healthBack?.cursor >= lastSeq, `${back}, marker ${await marked()}, key ${healthBack?.connection?.key?.state}, cursor ${lastSeq} → ${healthBack?.cursor}`);
    await shot(pg, "48-ops-loops-back");

    // (b) the key revoked while Live: the fake comes back on its port with another key, so the host's key gets 401
    // from a loops whose health answers (a verdict), not a loops that is down.
    lastSeq = fake.lastSeq();
    await fake.close();
    // The new key is another bot's (round 48): the page must name the key the host holds now.
    const secondName = `${keyName}-2`;
    fake = await rig.loopsAgain({ ...fakeOptions, port, keyName: secondName, firstSeq: lastSeq });
    const rejected = await screen("rejected", 30000);
    // The screen asks the host at once for loops' reason; give that read a moment.
    let reason = "";
    for (let attempt = 0; attempt < 16 && !/refused the key on the event stream/.test(reason); attempt += 1) {
      await pg.waitForTimeout(250);
      reason = (await pg.locator(".connect-rejected").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    }
    const forgetButtons = await pg.getByRole("button", { name: "Forget this key" }).count();
    const healthRejected = await healthUntil((h) => h.connection?.key?.state === "rejected", 10000);
    ok("ops (b): the key revoked while Live: the rejected screen over the live tab with loops' reason, the kept key and Forget; the host's key state is rejected", rejected && /refused the key on the event stream/.test(reason) && forgetButtons === 1 && healthRejected?.connection?.key?.state === "rejected" && healthRejected?.loops === "unauthorized", `${rejected ? "rejected screen" : `no rejected screen (chip ${await chipState()})`}; key ${healthRejected?.connection?.key?.state}; ${reason.slice(0, 100)}`);
    await shot(pg, "49-ops-key-revoked");
    const secondKey = fake.key;
    await pg.getByLabel("Access key").fill(secondKey);
    await pg.keyboard.press("Enter");
    const liveAgain = await until("live", 30000);
    let storedKey = "";
    try {
      storedKey = readFileSync(store.file, "utf8").trim();
    } catch {}
    const healthNew = await healthUntil((h) => h.connection?.key?.state === "ok" && h.connection?.stream?.state === "ok", 10000);
    ok("ops (b): the new key pasted: the town is back by itself without a reload, the host stores the new key and streams with it, neither key is anywhere in the page", liveAgain === "live" && (await marked()) === "set" && storedKey === secondKey && healthNew?.connection?.key?.state === "ok" && !(await leaked(firstKey)) && !(await leaked(secondKey)), `${liveAgain}, marker ${await marked()}, stored ${storedKey === secondKey}, key ${healthNew?.connection?.key?.state}`);
    storedKey = "";
    await shot(pg, "50-ops-new-key");
    // Round 48 (r48-ui U3): Settings > Source names the key the host holds now, not the one the page started with.
    await pg.getByRole("button", { name: "Settings", exact: true }).click();
    await pg.waitForSelector(".settings-sheet", { timeout: 5000 }).catch(() => {});
    const sourceHost = (await pg.locator(".settings-sheet .source-host").innerText().catch(() => "")).replace(/\s+/g, " ");
    ok("ops (b): Settings names the key the host holds now, not the one the page started with", sourceHost.includes(`Key: ${secondName}.`) && !sourceHost.includes(`Key: ${keyName}.`), sourceHost.slice(0, 160));
    await pg.getByRole("button", { name: /close settings/i }).first().click().catch(() => pg.keyboard.press("Escape"));
    await pg.waitForSelector(".settings-sheet", { state: "detached", timeout: 5000 }).catch(() => {});

    // (c) loops upgraded: the fake comes back on its port with another health version.
    lastSeq = fake.lastSeq();
    await fake.close();
    fake = await rig.loopsAgain({ ...fakeOptions, version: "0.2.0+fake.ops", port, key: secondKey, keyName: secondName, firstSeq: lastSeq });
    const liveUpgraded = await until("live", 30000);
    const healthUpgraded = await healthUntil((h) => h.loopsCommit === "0.2.0+fake.ops", 15000);
    const factsUpgraded = await panelFacts((f) => /it was 0\.1\.0\+fake\.ops when this host started/.test(f));
    ok("ops (c): loops upgraded under the host: Live, health says the new version and the one the host read first, the panel says crewhub-loops was updated under the host", liveUpgraded === "live" && healthUpgraded?.loopsCommit === "0.2.0+fake.ops" && healthUpgraded?.loopsCommitBefore === "0.1.0+fake.ops" && /crewhub-loops version 0\.2\.0\+fake\.ops; it was 0\.1\.0\+fake\.ops when this host started/.test(factsUpgraded), `${liveUpgraded}; ${healthUpgraded?.loopsCommitBefore ?? "no before"} → ${healthUpgraded?.loopsCommit}; ${factsUpgraded.slice(0, 160)}`);
    await shot(pg, "51-ops-upgraded");
    // The revoked key's 401 and the refused reads it causes are console errors in the browser, what they are meant to be.
    problems.push(...own.filter((x) => !(x.kind === "console" && /status of (401|403|503)/.test(x.text))));
  } finally {
    await ctx.close().catch(() => {});
    await rig.close();
    rmSync(configDir, { recursive: true, force: true });
  }
}
