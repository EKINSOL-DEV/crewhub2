/**
 * The connect flow (spec addendum "a smooth connection"), always behind your Vite: the stub host of lib/connectStub.mjs
 * (every screen in order, the key in no DOM, storage or URL, Forget, the unpaired state, the Stream busy chip), and, only
 * when real is asked for, the real development loops with a keyless host started here.
 *
 * One group of regress.mjs (round 61, T3): `run({ pass, page, check, out })` with the run's rig and plan (`pass`), the
 * page helpers (`page`), the check recorder (`check`) and the output folder (`out`); see regress.mjs for the four.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chip as chipOf, chipWord, connectTitle, drawn, openPage, readTextView as text, screenShown, textView as sheet, untilChip } from "../lib/page.mjs";
import { dressed, watch } from "../lib/world.mjs";
import { startRig } from "../lib/rig.mjs";
import { createConnectStub } from "../lib/connectStub.mjs";
import { connectGroupAdmits } from "../lib/closingCheck.ts";
import { appDataPort, ownAppData, ownLoopsUrl } from "../lib/toolGuard.ts";

export async function run({ pass, page, check, out }) {
  const { browser, opts, plan, groups, origin, base: BASE, repo: REPO, problems, forgets, loopsOriginGetters, noteLoopsUrl, loopsEnvFile, loopsAppData, readEnvFile } = pass;
  const { town, canvas } = page;
  const { ok, info } = check;
  const { dir: OUT, tag, shot } = out;
  // 15b. The connect flow (spec addendum "a smooth connection"), always behind your Vite: first the stub host of
  // lib/connectStub.mjs and then a real, keyless host listen on --host-port (CREWHUB_WORLD_PORT) and the browser opens
  // your Vite. apps/world/dist is never looked at here, whatever the live group does when it exists: the stub has no
  // static files, and a one-time pairing link must land on the Vite origin to pair the page that opens it.
  const hostPort = Number(opts["host-port"]);
  if (!Number.isInteger(hostPort) || hostPort <= 0) opts.fail("--host-port <port> must be a port number");
  const GOOD_KEY = "chl_" + "stubKEY-_0123456789abcdefghijklmnopqrstuvwx".slice(0, 43);
  const screen = (pg, which, timeout = 15000) => screenShown(pg, which, timeout);
  const title = connectTitle;
  const chip = chipOf;
  const chipState = chipWord;
  const until = untilChip;
  const keyField = (pg) => pg.getByLabel("Access key");
  /** Types a key into the field and submits it with Enter, as a person does. */
  const paste = async (pg, key) => {
    await keyField(pg).fill(key);
    await pg.keyboard.press("Enter");
  };
  /** Whether a key shows anywhere it must not: the DOM, local or session storage, the URL (a middle slice: never its tail, which the hint names). */
  const leaked = async (pg, key) => {
    const part = key.slice(4, 24);
    const html = await pg.content();
    const stored = await pg.evaluate(() => JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage))).catch(() => "");
    return html.includes(part) || stored.includes(part) || pg.url().includes(part);
  };
  /** How many times the page asks the host's health in `ms`. */
  const healthAsks = async (pg, ms) => {
    let count = 0;
    const seen = (request) => {
      if (new URL(request.url()).pathname === "/world-api/health") count += 1;
    };
    pg.on("request", seen);
    await pg.waitForTimeout(ms);
    pg.off("request", seen);
    return count;
  };
  const reasonText = async (pg) => (await pg.locator(".connect-rejected").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  /** A mark set on the window: still there at the end means the page never reloaded in between. */
  const mark = (pg) => pg.evaluate(() => ((globalThis.__connectMarker = "set"), undefined));
  const marked = (pg) => pg.evaluate(() => globalThis.__connectMarker ?? null).catch(() => null);
  // The browser logs every 4xx and 5xx a fetch meets: the refused key's 403, the unpaired tab's 401, the 503 no_key the
  // other tab's stream meets when it reconnects after a Forget elsewhere, and the forgetting tab's own read inside its
  // Forget (`forgets`); the rule is lib/closingCheck.ts's `connectGroupAdmits`, tested on recorded runs.
  const expected = (x) => connectGroupAdmits(x, forgets);
  const own = [];
  const openConnect = (label) => openPage(browser, { origin, problems: own, tag: label });

  /** Half one: every screen in order against the stub, on one page; the stub decides the host's state, the page follows by polling. */
  async function stubHalf() {
    // "checking" holds until the tool moves the stub on (a real host would connect or refuse in a second).
    const stub = await createConnectStub({ port: hostPort, state: "no-loops", origin, checkMs: 60_000, log: () => undefined });
    loopsOriginGetters.push(() => stub.webUrl());
    info(`connect: stub host on 127.0.0.1:${stub.port} behind the Vite proxy on ${origin} (Vite started with CREWHUB_WORLD_PORT=${hostPort})`);
    try {
      const pg = await openConnect("connect stub");
      await pg.goto(BASE);
      const noLoops = await screen(pg, "no-loops");
      ok("connect: No crewhub-loops found comes first", noLoops && /No crewhub-loops found/.test(await title(pg)), await title(pg));
      // Round 48 (r48-ui U1): a Connect screen asks every 2.5 s (state/health.ts, HEALTH_POLL_MS.screen). The gate's
      // onHealth was a new function on every answer, so the poll's effect started again with each one and asked back to
      // back, thousands of times a second.
      const asks = await healthAsks(pg, 6000);
      ok("connect: a Connect screen asks the host's health every 2.5 s, not back to back", asks <= 5, `${asks} health request(s) in 6 s`);
      await shot(pg, "34-connect-no-loops");
      await stub.setState("pair");
      const pair = await screen(pg, "pair");
      // Walk finding w2-7 (round 65): "I opened the link" pressed before any link was opened says so under the button
      // once the host has answered again (the stub still says pair), in a polite live region; before the press it is silent.
      const stillBefore = (await pg.locator(".pair-still").innerText().catch(() => "")).trim();
      await pg.getByRole("button", { name: "I opened the link" }).click().catch(() => {});
      await pg.waitForFunction(() => (document.querySelector(".pair-still")?.textContent ?? "").trim().length > 0, null, { timeout: 5000 }).catch(() => {});
      const stillAfter = (await pg.locator(".pair-still").innerText().catch(() => "")).trim();
      const stillLive = await pg.locator('.pair-still[role="status"]').count();
      await shot(pg, "34b-connect-pair-still-unpaired");
      ok("connect (w2-7): I opened the link, pressed with no link opened, says the browser is still not paired under the button, said politely", stillBefore === "" && stillAfter === "This browser is still not paired: open the link npm run world printed first." && stillLive === 1, `before "${stillBefore}"; after "${stillAfter}"; live regions ${stillLive}`);
      const pairBody = (await pg.locator(".connect-page").innerText().catch(() => "")).replace(/\s+/g, " ");
      ok("connect: Pair this browser names npm run world and never a link", pair && /Pair this browser/.test(pairBody) && /npm run world/.test(pairBody) && !/\/pair\//.test(pairBody), pairBody.slice(0, 120));
      await stub.setState("connect");
      const connect = await screen(pg, "connect");
      ok("connect: the Connect screen offers a masked key field", connect && (await keyField(pg).getAttribute("type").catch(() => null)) === "password");
      await shot(pg, "35-connect-connect");
      await mark(pg);
      await paste(pg, GOOD_KEY);
      const checking = await screen(pg, "checking", 5000);
      const fieldAfter = await keyField(pg).inputValue().catch(() => "?");
      ok("connect: Enter posts the key, the field is empty again and the host says checking", checking && stub.state === "checking" && fieldAfter === "", `stub ${stub.state}, field "${fieldAfter}"`);
      await stub.setState("rejected");
      const rejected = await screen(pg, "rejected");
      const reason = await reasonText(pg);
      const forgetButton = pg.getByRole("button", { name: "Forget this key" });
      ok("connect: the rejected screen gives loops' reason, keeps the key and offers Forget", rejected && /Read only/.test(reason) && (await forgetButton.count()) === 1, reason.slice(0, 100));
      // Round 48 (r48-ui U2): the field is disabled while the key is checked, which drops the focus to the page; the answer
      // gives it back, so a keyboard user is where they were and can paste another key.
      const focused = await pg.evaluate(() => (document.activeElement ? `${document.activeElement.tagName.toLowerCase()} ${document.activeElement.getAttribute("type") ?? ""}`.trim() : "none")).catch(() => "?");
      ok("connect: the refused key gives the focus back to the key field, not the page", focused === "input password", `focus on ${focused}`);
      await shot(pg, "36-connect-rejected");
      await forgetButton.click();
      const back = await screen(pg, "connect", 10000);
      ok("connect: Forget this key brings the Connect screen back", back && stub.state === "connect", `stub ${stub.state}`);
      await stub.setState("loops-down");
      const down = await screen(pg, "loops-down");
      ok("connect: crewhub-loops not answering has its own screen, never an empty town", down && /not answering/.test(await title(pg)), await title(pg));
      await shot(pg, "37-connect-loops-down");
      await stub.setState("connected");
      await pg.waitForSelector("canvas", { timeout: 30000 }).catch(() => {});
      const live = await until(pg, "live", 30000);
      const marker = await marked(pg);
      ok("connect: the town appears with the Live chip, without a reload", live === "live" && marker === "set", `${live}, marker ${marker}`);
      // The town that follows the accepted key says it is live, once (round 65, w5-22): before, only "Opening CrewHub…" after "Key sent to the host…".
      await pg.waitForTimeout(800);
      const saidLive = (await pg.locator("[aria-live=polite]").allInnerTexts()).join(" ").replace(/\s+/g, " ").trim();
      ok("connect: the connection is said once the town is live (w5-22)", /Connected: Live\./.test(saidLive), saidLive.slice(-80));
      await dressed(pg, 30000).catch(() => {});
      await shot(pg, "38-connect-town");
      ok("connect: the key is in no DOM, storage or URL", !(await leaked(pg, GOOD_KEY)));
      await chip(pg).click();
      await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
      const facts = (await pg.locator(".connection-facts").innerText().catch(() => "")).replace(/\s+/g, " ");
      const inPanel = await pg.evaluate(() => document.querySelector(".connection-sheet")?.contains(document.activeElement) === true).catch(() => false);
      await shot(pg, "39-connect-panel");
      await pg.keyboard.press("Escape");
      await pg.waitForTimeout(200);
      const closed = (await pg.locator(".connection-sheet").count()) === 0 && (await pg.evaluate(() => document.activeElement?.classList.contains("connection-chip")).catch(() => false)) === true;
      ok("connect: the panel names where loops was found, the key and the stream; Escape hands the focus back to the chip", /found/.test(facts) && /crewhub-world/.test(facts) && /socket/.test(facts) && /streaming/.test(facts) && inPanel && closed, facts.slice(0, 140));
      // Forget this key in one tab (round 10, r10-sheet): the other live tabs lose the host's key, not their standing with
      // loops: they show the Connect screen (the host's key is none), never "crewhub-loops rejected the key", and without a
      // reload. The forgetting tab reloads onto the Connect screen itself.
      const other = await pg.context().newPage();
      watch(other, origin, own, "connect stub other tab");
      await other.goto(BASE);
      const otherLive = await until(other, "live", 30000);
      await mark(other);
      // The Forget's window (lib/closingCheck.ts): from the click to the forgetting tab live again; a read of that tab
      // that lands in it (a thin event's ticket refetch) meets the stub's 503 no_key before the tab reloads, and is admitted.
      const forget = { tag: "connect stub", pageOrigin: origin, from: Date.now(), to: 0 };
      forgets.push(forget);
      await chip(pg).click();
      await pg.getByRole("button", { name: "Forget this key" }).click();
      // Round 64 (w5-24): the button gives way to the question (Forget / Keep); the focus must land on the safe choice, never on the body.
      await pg.waitForTimeout(200);
      const keepFocus = await pg.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? "body" : (a.textContent?.trim() ?? a.tagName); });
      ok("connect (round 64, w5-24): Forget this key hands the focus to the confirmation's safe choice, Keep", keepFocus === "Keep", `focus on "${keepFocus}"`);
      await pg.getByRole("button", { name: "Forget", exact: true }).click();
      const otherConnect = await screen(other, "connect", 15000);
      const otherRejected = (await other.locator('.connect-page[data-screen="rejected"]').count()) > 0;
      ok("connect: Forget this key in one tab sends the other live tab to the Connect screen (the host has no key), never to rejected, without a reload", otherLive === "live" && otherConnect && !otherRejected && stub.state === "connect" && (await marked(other)) === "set", `other: live ${otherLive}, connect ${otherConnect}, rejected ${otherRejected}; stub ${stub.state}`);
      await shot(other, "39b-connect-other-tab-after-forget");
      await other.close();
      await stub.setState("connected");
      const relive = await until(pg, "live", 30000);
      forget.to = Date.now();
      ok("connect: after the forget, a key again brings the forgetting tab's town back", relive === "live", relive);
      await mark(pg);
      // A host that no longer knows this browser (a restart without its secret): the tab shows Pair this browser, not
      // Stale, and comes back by itself once it is paired again.
      await stub.setState("unpaired");
      const pairAgain = await screen(pg, "pair", 20000);
      ok("connect: a live tab the host no longer knows shows Pair this browser", pairAgain, pairAgain ? "" : `chip ${await chipState(pg)}`);
      await shot(pg, "40-connect-pair-again");
      await stub.setState("connected");
      const again = await until(pg, "live", 20000);
      const marker2 = await marked(pg);
      ok("connect: paired again, the town comes back by itself without a reload", again === "live" && marker2 === "set", `${again}, marker ${marker2}`);
      await pg.context().close();
      // loops' 429 on the stream (another host or tab uses the key): the town with the Stream busy chip, on a fresh page.
      await stub.setState("busy");
      const busyPage = await openConnect("connect stub busy");
      await busyPage.goto(BASE);
      const busy = await until(busyPage, "stream-busy", 30000);
      const word = (await chip(busyPage).innerText().catch(() => "")).trim();
      const townDrawn = await dressed(busyPage, 20000).then(() => true).catch(() => false);
      ok("connect: loops' 429 on the stream is the Stream busy chip over the town", busy === "stream-busy" && /Stream busy/.test(word) && townDrawn, `${busy}: ${word}; town drawn ${townDrawn}`);
      await shot(busyPage, "41-connect-busy");
      await busyPage.context().close();
    } finally {
      await stub.close().catch(() => {});
    }
  }

  /** Half two: a keyless host the tool starts against the real development loops, found through its data folder. */
  async function realHalf() {
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
    const loopback = parsed !== null && parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.port !== "";
    if (!loopback || keyFile === "") {
      info(`connect: the real half skipped, no loopback LOOPS_DEV_URL and LOOPS_DEV_KEY_FILE in ${envFile}`);
      return;
    }
    // Never the Mac app's port nor 5180, even when the env file names it (a typo of 8291 is 8091). `real` is the
    // development loops' opt-in (round 57d, §5b.4): only real asked for (in --groups or by --real) reaches here.
    const urlVerdict = ownLoopsUrl(loopsUrl, { real: plan.real });
    if (!urlVerdict.ok) opts.fail(`${envFile}: LOOPS_DEV_URL ${urlVerdict.reason}`);
    const appData = loopsAppData();
    if (!existsSync(path.join(appData, "settings.json"))) {
      info(`connect: the real half skipped, no settings.json in ${appData} (--loops-app-data names the development loops' data folder)`);
      return;
    }
    // The folder must be a development loops' own, never the Mac app's, and its settings.json must name a port that is
    // neither the app's nor the world host's (round 36): the keyless host below looks exactly there.
    const folderVerdict = ownAppData(appData, process.env.HOME ?? "~");
    if (!folderVerdict.ok) opts.fail(`--loops-app-data: ${folderVerdict.reason}`);
    const portVerdict = appDataPort(readFileSync(path.join(appData, "settings.json"), "utf8"));
    if (!portVerdict.ok) opts.fail(`--loops-app-data ${appData}: ${portVerdict.reason}`);
    const pg = await openPage(browser, { origin, problems: own, tag: `connect ${parsed.port}` });
    const ctx = pg.context();
    const half = (words) => `connect (${parsed.port}): ${words}`;
    const health = await pg.request.get(`${loopsUrl}/api/health`, { timeout: 2000 }).then((r) => (r.ok() ? r.json() : null)).catch(() => null);
    if (!health?.ok) {
      info(`connect: the real half skipped, ${parsed.port} is down`);
      await ctx.close();
      return;
    }
    const readKey = (file) => {
      try {
        return readFileSync(file, "utf8").trim();
      } catch {
        return "";
      }
    };
    let key = readKey(keyFile);
    if (key === "") {
      info(`connect: the real half skipped, cannot read the key file named by ${envFile}`);
      await ctx.close();
      return;
    }
    // The Read only bot's key: LOOPS_DEV_READONLY_KEY_FILE, else the key file's name with -ro before .key.
    const readonlyFile = env.LOOPS_DEV_READONLY_KEY_FILE ?? keyFile.replace(/\.key$/, "-ro.key");
    let readonlyKey = readKey(readonlyFile);
    const { createKeyStore } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "keyStore.ts")).href);
    const { createArchiveStore } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "archiveStore.ts")).href);
    const { loadPairingSecret } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "pairing.ts")).href);
    const { PAIRING_SECRET_NAME, storedKeyFile } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "config.ts")).href);
    // A fresh folder of the host's own for this run (the stored key and the pairing secret land here), removed at the end.
    const configDir = path.join(OUT, `${tag}-connect-config`);
    rmSync(configDir, { recursive: true, force: true });
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    const secretFile = path.join(configDir, PAIRING_SECRET_NAME);
    const keyPath = storedKeyFile(configDir);
    // What `npm run world` gives the host: the discovery through the data folder, its own stores, pairing on with the
    // secret kept in a file (the second host reads the same file: that is what keeps every paired browser).
    // The rig (lib/rig.mjs): a keyless host behind your Vite, discovering through the data folder, with its stores,
    // pairing on with the secret from the file. The restart below hands the secret read from the file again and new
    // stores (round 62, T-2): the morning-after road of `npm run world`, a host that reads the file, is what it proves.
    const rig = await startRig({
      loops: { discovery: { appData, intervalMs: 1000 } },
      serve: { origin, hostPort },
      pairing: { secret: loadPairingSecret(secretFile) },
      host: { keyStore: createKeyStore(configDir), archiveStore: createArchiveStore(configDir) },
      timings: { retryMs: { min: 200, max: 2000 } },
      log: () => undefined,
    });
    let host = rig.host;
    info(`connect: loops on 127.0.0.1:${parsed.port} (version ${health.version}); a keyless host on 127.0.0.1:${host.port} looking in ${appData}, its folder ${configDir}, pairing on, behind the Vite proxy on ${origin}`);
    const hostApi = (p) => pg.request.get(`${origin}/world-api${p}`).then((r) => r.json());
    try {
      await pg.goto(host.mintPairLink(origin));
      const landed = new URL(pg.url());
      const connect = await screen(pg, "connect", 20000);
      const first = await hostApi("/health").catch(() => null);
      ok(half("the one-time link lands on the Connect screen of a keyless host that found loops"),
        landed.pathname === "/" && landed.origin === origin && connect && first?.paired === true && first?.connection?.discovery?.state === "found" && first?.connection?.key?.state === "none",
        `${landed.pathname}; loops ${first?.connection?.discovery?.state} via ${first?.connection?.discovery?.via}, key ${first?.connection?.key?.state}`,
      );
      await shot(pg, "42-connect-real-connect");
      await mark(pg);
      if (readonlyKey === "") info(`connect: no Read only key at ${readonlyFile} (LOOPS_DEV_READONLY_KEY_FILE), that check is skipped`);
      else {
        await paste(pg, readonlyKey);
        await pg.waitForFunction(() => /Read only/.test(document.querySelector(".connect-rejected")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
        const roReason = await reasonText(pg);
        ok(half("a Read only bot's key is refused with the words to make one with Read only off"), /Read only/.test(roReason) && /"Read only" off/.test(roReason) && !(await leaked(pg, readonlyKey)), roReason.slice(0, 140));
        readonlyKey = "";
      }
      const bogus = "chl_" + randomBytes(33).toString("base64url").slice(0, 43);
      await paste(pg, bogus);
      await pg.waitForFunction(() => /does not know/.test(document.querySelector(".connect-rejected")?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
      const bogusReason = await reasonText(pg);
      const usable = (await screen(pg, "connect", 2000)) && (await keyField(pg).count()) === 1 && (await keyField(pg).isEnabled().catch(() => false));
      ok(half("a key loops does not know is refused and the screen stays usable"), /does not know this key/.test(bogusReason) && usable, bogusReason.slice(0, 100));
      await shot(pg, "43-connect-real-refused");
      await paste(pg, key);
      await pg.waitForSelector("canvas", { timeout: 60000 }).catch(() => {});
      const live = await until(pg, "live", 30000);
      const marker = await marked(pg);
      const stored = existsSync(keyPath);
      ok(half("the pasted key connects: the Live chip without a reload, the key stored by the host"), live === "live" && marker === "set" && stored, `${live}, marker ${marker}, stored ${stored}`);
      await dressed(pg, 30000).catch(() => {});
      await shot(pg, "44-connect-real-live");
      const snapshot = await hostApi("/snapshot").catch(() => null);
      const names = (snapshot?.projects ?? []).map((p) => `${p.name} (${p.key})`);
      const tv = await text(pg);
      ok(half("the town shows the real projects by name"), names.length > 0 && names.every((n) => tv.includes(n)) && !/Demo mode/.test(tv), names.join(", ") || tv.slice(0, 120).replace(/\n/g, " | "));
      ok(half("the key is in no DOM, storage or URL"), !(await leaked(pg, key)));
      // The host stopped and started again, as the morning after: the stored key and the same secret file, read again
      // (not the bytes the first host was given), its stores made again, so the tab is Live again without a new link.
      await host.close();
      host = null;
      const atStop = await until(pg, "stale", 10000);
      const storedKey = readKey(keyPath);
      const restarted = Date.now();
      host = await rig.restart({
        pairingSecret: loadPairingSecret(secretFile),
        keyStore: createKeyStore(configDir),
        archiveStore: createArchiveStore(configDir),
        key: storedKey,
        keyName: "crewhub-world",
        keySource: "stored",
      });
      const again = await until(pg, "live", 30000);
      const marker2 = await marked(pg);
      const after = await hostApi("/health").catch(() => null);
      ok(half("a restarted host with the kept pairing secret is Live again without a re-pair"),
        again === "live" && marker2 === "set" && after?.paired === true && after?.connection?.key?.state === "ok" && after?.connection?.key?.source === "stored",
        `${atStop} at the stop, ${again} ${((Date.now() - restarted) / 1000).toFixed(1)} s after the new host; key ${after?.connection?.key?.state} (${after?.connection?.key?.source}), marker ${marker2}`,
      );
      await shot(pg, "45-connect-real-restarted");
      await chip(pg).click();
      await pg.waitForSelector(".connection-sheet", { timeout: 5000 }).catch(() => {});
      await pg.getByRole("button", { name: "Forget this key" }).click();
      await pg.getByRole("button", { name: "Forget", exact: true }).click();
      const forgot = await screen(pg, "connect", 20000);
      const fileGone = !existsSync(keyPath);
      ok(half("Forget this key hands the Connect screen back and the stored key is gone"), forgot && fileGone, `screen ${forgot ? "connect" : "not connect"}, file gone ${fileGone}`);
      await shot(pg, "46-connect-real-forgotten");
    } finally {
      key = "";
      readonlyKey = "";
      await rig.close();
      rmSync(configDir, { recursive: true, force: true });
      await ctx.close().catch(() => {});
    }
  }

  try {
    await stubHalf();
    // The real half aims at the development loops: only when real is asked for, as the real group (round 57d, 58d).
    if (plan.real) await realHalf();
    else info("connect: the real half not run, real not asked for (--real, or real in --groups)");
  } finally {
    problems.push(...own.filter((x) => !expected(x)));
  }
}
