/**
 * The live operations road (round 7): the fake closed and reopened on its port, reopened with another key (the host's key
 * revoked while Live, a new one pasted), and reopened with another health version (loops upgraded), under a host started here.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openPage, screenShown, textView as sheet, untilChip } from "../lib/page.mjs";
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
  await runChipWords({ pass, check, out });
}

/**
 * Design choice L1's chip words as a person sees them (round 75; L1 is round 72's, and until now node tests held them).
 * A real host over the fake, with both causes real: `host-tabs` is 64 streams on the host, the page's own the one too
 * many; `host-failed` is loops' list naming a project under a slug no allow-list takes (a small proxy between the host
 * and the fake adds it while `broken`, as stream.test.ts's review F8 case does), so the host's own message reaches the
 * chip. For each: the cause read first from the host's own answer (a row that held nothing would fail here), then the
 * chip's word and tone, its hint, the panel's state and hint, the spoken change, and Live again without a reload when
 * the cause goes (the page keeps asking). Its own rig, after the ops group's rig closed, on the same port.
 */
export async function runChipWords({ pass, check, out }) {
  const { browser, opts, origin, repo: REPO, dist: DIST, problems, noteLoops } = pass;
  const { ok } = check;
  const { shot } = out;
  const { createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href);
  const { MAX_TABS } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
  const fake = noteLoops(await createLoopsFake({ heartbeatMs: 1000 }));
  const target = new URL(fake.url);
  let broken = false;
  const proxy = createServer((req, res) => {
    const listing = broken && new URL(req.url ?? "/", "http://127.0.0.1").pathname === "/api/projects";
    const upstream = httpRequest({ host: target.hostname, port: target.port, method: req.method, path: req.url, headers: { ...req.headers, host: target.host, "accept-encoding": "identity" } }, (answer) => {
      if (!listing) {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        res.flushHeaders();
        answer.pipe(res);
        return;
      }
      let text = "";
      answer.on("data", (chunk) => (text += chunk.toString()));
      answer.on("end", () => {
        const body = JSON.parse(text);
        // The list with archived projects is refused to an agent key (a 403 with no list), and the host then asks without them.
        if (Array.isArray(body.projects)) body.projects = [...body.projects, { ...body.projects[0], slug: "Not A Slug" }];
        const headers = { ...answer.headers };
        delete headers["content-length"];
        res.writeHead(answer.statusCode ?? 502, headers);
        res.end(JSON.stringify(body));
      });
    });
    upstream.on("error", () => res.destroy());
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  noteLoops({ url: proxyUrl });
  const rig = await startRig({ loops: { url: proxyUrl, key: fake.key, keyName: fake.keyName }, serve: { dist: DIST, origin, hostPort: Number(opts["host-port"]) }, pairing: "off", log: () => undefined });
  const own = [];
  const tabs = [];
  /** One tab's stream on the host itself, held open: resolves with its status once the host answered. */
  const holdTab = () =>
    new Promise((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port: rig.host.port, path: "/world-api/stream?cursor=0", agent: false }, (answer) => {
        let text = "";
        if (answer.statusCode !== 200) answer.on("data", (chunk) => (text += chunk.toString()));
        answer.on("end", () => resolve({ status: answer.statusCode, text, req }));
        if (answer.statusCode === 200) resolve({ status: 200, text, req });
      });
      req.on("error", (error) => (req.destroyed ? undefined : reject(error)));
      req.end();
    });
  const said = async (p, words) => {
    const deadline = Date.now() + 5000;
    let all = "";
    for (;;) {
      all = (await p.locator("[aria-live=polite]").allInnerTexts()).join(" ").replace(/\s+/g, " ");
      if (all.includes(words) || Date.now() > deadline) return all;
      await p.waitForTimeout(100);
    }
  };
  /** The chip and the panel as a person reads them; the panel is closed again. */
  const chipFacts = async (p) => {
    const chip = p.locator(".connection-chip").first();
    const word = (await chip.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const title = (await chip.getAttribute("title").catch(() => "")) ?? "";
    const attention = (await chip.locator(".chip-attention").count().catch(() => 0)) > 0;
    await chip.click();
    await p.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
    const facts = (await p.locator(".connection-facts").innerText().catch(() => "")).replace(/\s+/g, " ");
    await p.keyboard.press("Escape");
    await p.waitForSelector(".connection-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
    return { word, title, attention, facts };
  };
  const openHere = async () => {
    const p = await openPage(browser, { origin: rig.origin, problems: own, tag: "L1 chip" });
    await p.goto(`${rig.origin}/`);
    await p.waitForSelector(".connection-chip", { timeout: 60000 }).catch(() => {});
    return p;
  };
  try {
    // host-tabs: the host's 64 streams, read first: one more is the 503 the page is about to meet.
    for (let i = 0; i < MAX_TABS; i += 1) tabs.push(await holdTab());
    const refused = await holdTab();
    const cause = /"error":"too_many_tabs"/.test(refused.text) && refused.status === 503;
    const hint = "This host has too many tabs open; close one. crewhub-loops is fine; the page keeps asking.";
    const p1 = await openHere();
    await p1.evaluate(() => ((globalThis.__l1Marker = "set"), undefined));
    const state1 = await untilChip(p1, "host-tabs", 30000);
    const spoken1 = await said(p1, `Connection: Too many tabs. ${hint}`);
    const facts1 = await chipFacts(p1);
    await shot(p1, "51x-l1-host-tabs");
    ok("L1 (round 75): a host holding its 64 tabs: the chip says Too many tabs with the host's hint, the panel says the same, the change is spoken", cause && state1 === "host-tabs" && facts1.word === "Too many tabs" && facts1.title === hint && facts1.attention && facts1.facts.includes(`Too many tabs ${hint}`) && spoken1.includes(`Connection: Too many tabs. ${hint}`), `the host's answer ${refused.status} ${refused.text.slice(0, 80)}; chip ${state1}: "${facts1.word}", attention ${facts1.attention}, title "${facts1.title.slice(0, 60)}"; panel "${facts1.facts.slice(0, 120)}"; spoken "${spoken1.slice(0, 120)}"`);
    tabs.pop().req.destroy();
    const back1 = await untilChip(p1, "live", 30000);
    const word1 = (await p1.locator(".connection-chip").first().innerText().catch(() => "")).trim();
    const marker1 = await p1.evaluate(() => globalThis.__l1Marker ?? null).catch(() => null);
    ok("L1 (round 75): one tab closed, the page that kept asking is Live again without a reload", back1 === "live" && word1 === "Live" && marker1 === "set", `${back1}: "${word1}", marker ${marker1}`);
    await p1.context().close();
    for (const tab of tabs.splice(0)) tab.req.destroy();

    // host-failed: loops' list names a project no allow-list takes; the host's own read, then its own message on the chip.
    broken = true;
    const p2 = await openHere();
    await p2.evaluate(() => ((globalThis.__l1Marker = "set"), undefined));
    const answer = await p2.request.get(`${rig.origin}/world-api/snapshot`);
    const body = await answer.json().catch(() => ({}));
    const causeFailed = answer.status() === 503 && body.error === "snapshot_failed" && /allow-list/.test(body.message ?? "");
    const hint2 = `The world's host could not read crewhub-loops: ${body.message ?? "?"}`;
    const state2 = await untilChip(p2, "host-failed", 30000);
    const spoken2 = await said(p2, `Connection: Host could not read loops. ${hint2}`);
    const facts2 = await chipFacts(p2);
    await shot(p2, "51y-l1-host-failed");
    ok("L1 (round 75): a snapshot the host itself could not assemble: the chip says Host could not read loops with the host's own message, the panel says the same, the change is spoken, and never Loops down", causeFailed && state2 === "host-failed" && facts2.word === "Host could not read loops" && facts2.title === hint2 && facts2.attention && facts2.facts.includes(`Host could not read loops ${hint2}`) && spoken2.includes(`Connection: Host could not read loops. ${hint2}`) && !/Loops down/.test(`${facts2.word} ${facts2.facts}`), `the host's answer ${answer.status()} ${body.error}: ${(body.message ?? "").slice(0, 90)}; chip ${state2}: "${facts2.word}", attention ${facts2.attention}, title "${facts2.title.slice(0, 100)}"; panel "${facts2.facts.slice(0, 140)}"; spoken "${spoken2.slice(0, 120)}"`);
    broken = false;
    const back2 = await untilChip(p2, "live", 30000);
    const word2 = (await p2.locator(".connection-chip").first().innerText().catch(() => "")).trim();
    const marker2 = await p2.evaluate(() => globalThis.__l1Marker ?? null).catch(() => null);
    ok("L1 (round 75): the cause gone, the page that kept asking is Live again without a reload", back2 === "live" && word2 === "Live" && marker2 === "set", `${back2}: "${word2}", marker ${marker2}`);
    await p2.context().close();
    // The 503s the page met are what this row provokes; the browser logs each. Anything else still fails the closing check.
    problems.push(...own.filter((x) => !(x.kind === "console" && /status of 503/.test(x.text))));
  } finally {
    for (const tab of tabs.splice(0)) tab.req.destroy();
    await rig.close();
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
    await fake.close().catch(() => undefined);
  }
}
