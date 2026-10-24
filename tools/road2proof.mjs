/* road2proof.mjs: the browser proof of road 2 of the chat (round 28): the page reads the signed-in person's own
   conversation from a real crewhub-loops itself, through the one origin that loops names in `CHL_WORLD_ORIGIN`.

   It starts two hosts (`apps/host`, in-process, pairing off) against `--loops-url` with the key of `--key-file` (a
   plain bot's, NOT a viewer's: then the host's key does not read the chat and the page's road is the one the contract
   picks), each serving `apps/world/dist` on its own port: `--port` must be the loops' `CHL_WORLD_ORIGIN` port (the
   proof page), `--other-port` any other (the page on another origin). Then, in a headless browser:
     1. signed in: a context signs in through loops' own login page (`--loops-env` names the admin's id and password,
        LOOPS_DEV_ADMIN_ID and LOOPS_DEV_ADMIN_PASS; read here, never printed), opens the proof page: Live, the page's
        probe says on, the Connection panel's Chat section and the Chat panel's About say so; then it waits up to
        `--bubble-timeout-s` for an agent's reply (`--agent`; a timed reply asked of whoever holds that agent's key) as
        a bubble and in Recent answers. Every request the page makes to loops is recorded through the browser's own
        network log (CDP, which lists CORS pre-flights too): no OPTIONS, no authorization header, the four routes only,
        and the header names of one GET (never a value: the cookie is the person's).
     2. signed out: a fresh context: the probe says signed out, the words.
     3. another origin: the signed-in context on `--other-port`: the probe says the origin is not set, the words with
        the exact `CHL_WORLD_ORIGIN=` value for that page.
   `--words-only` skips the reply (the bubble and Recent answers checks): the words and the request log alone, no reply needed.
   `--seed` first sends one message from the person to `--agent` when the thread has none (loops' own send route with
   the admin session; a reply needs a message to reply to); nothing else is written anywhere.

   Usage:
     node tools/road2proof.mjs --port 5283 --other-port 5194 --loops-url http://127.0.0.1:8293 --key-file <plain key>
                               --loops-env <env file> [--agent crewhub-lead] [--bubble-timeout-s 900] [--seed]
                               [--tag road2] [--out <dir>] [--swiftshader]
   Output in --out: <tag>-NN-<what>.png and <tag>-requests.json (the page's requests to loops: method, path, initiator,
   header NAMES). Prints road2proof: <passed>/<total> last; exit 0 at full marks. Loops is only ever a loopback address. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cli, launch } from "./lib/world.mjs";
import { ownPort } from "./lib/toolGuard.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const opts = cli("node tools/road2proof.mjs --port <CHL_WORLD_ORIGIN port> --other-port <port> --loops-url <url> --key-file <file> --loops-env <file> [--agent crewhub-lead] [--bubble-timeout-s 900] [--seed] [--words-only] [--tag road2] [--out <dir>] [--swiftshader]", {
  options: { "other-port": null, "loops-url": "", "key-file": "", "loops-env": "", agent: "crewhub-lead", "bubble-timeout-s": "900", tag: "road2" },
  flags: ["seed", "words-only"],
});
const otherVerdict = ownPort(opts["other-port"], "--other-port");
if (!otherVerdict.ok) opts.fail(otherVerdict.reason);
const otherPort = otherVerdict.value;
if (otherPort === opts.port) opts.fail("--other-port <port> must be another port than --port");
let loopsUrl;
try {
  const parsed = new URL(opts["loops-url"]);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(parsed.hostname)) throw new Error();
  if (["8091", "8000", "9443"].includes(parsed.port)) opts.fail(`--loops-url: port ${parsed.port} is the Mac app's, never a tool's target`);
  loopsUrl = parsed.origin;
} catch {
  opts.fail("--loops-url must be a loopback http URL");
}
const key = opts["key-file"] === "" ? "" : readFileSync(opts["key-file"], "utf8").trim();
if (key === "") opts.fail("--key-file <file> is required (a plain bot's key; read once, never printed)");
const keyName = path.basename(opts["key-file"]).replace(/^agent-/, "").replace(/\.key$/, "").replace(/-\d+$/, "");
const env = Object.fromEntries(
  (opts["loops-env"] === "" ? "" : readFileSync(opts["loops-env"], "utf8"))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const admin = { id: env.LOOPS_DEV_ADMIN_ID ?? "", password: env.LOOPS_DEV_ADMIN_PASS ?? "" };
if (admin.id === "" || admin.password === "") opts.fail("--loops-env must name LOOPS_DEV_ADMIN_ID and LOOPS_DEV_ADMIN_PASS (never printed)");
const agent = opts.agent;
if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(agent)) opts.fail("--agent is not an agent name");
const bubbleTimeoutMs = Number(opts["bubble-timeout-s"]) * 1000;
const dist = path.join(REPO, "apps", "world", "dist");
if (!existsSync(path.join(dist, "index.html"))) opts.fail("apps/world/dist is missing: npm run build first");

let passed = 0;
let total = 0;
const ok = (name, condition, detail = "") => {
  total++;
  if (condition) passed++;
  console.log(`${condition ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const info = (text) => console.log(`info ${text}`);
const shot = (p, name) => p.screenshot({ path: `${opts.out}${opts.tag}-${name}.png` });
const secretFree = (text) => !text.includes(key) && !text.includes(admin.password);

// --- The hosts: the proof page's origin, and another origin.
const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
const hostLines = [];
const hostOptions = { loopsUrl, key, keyName, pairing: "off", staticDir: dist, log: (line) => hostLines.push(line) };
const host = await createHost({ ...hostOptions, port: opts.port });
const other = await createHost({ ...hostOptions, port: otherPort });
info(`hosts: ${host.url} (the proof page, loops' CHL_WORLD_ORIGIN) and ${other.url} (another origin), both against ${loopsUrl} with key ${keyName}, serving apps/world/dist, pairing off`);

// --- The person's session on the node side (the seed only): loops' own login, the cookie kept in memory here.
async function adminCookie() {
  const response = await fetch(`${loopsUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: loopsUrl }, body: JSON.stringify(admin) });
  const cookies = response.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => /^chl_/.test(c));
  if (response.status !== 200 || cookies.length === 0) throw new Error(`loops login answered ${response.status}`);
  return cookies.join("; ");
}
async function seedThread() {
  const cookie = await adminCookie();
  const list = await fetch(`${loopsUrl}/api/dm/threads/${agent}/messages`, { headers: { cookie } });
  const body = list.status === 200 ? await list.json() : { messages: [] };
  const mine = (body.messages ?? []).filter((m) => m.author?.kind === "user");
  if (mine.length > 0) {
    info(`seed: ${admin.id}'s thread with ${agent} has ${mine.length} message(s) of theirs already; nothing sent`);
    return;
  }
  const sent = await fetch(`${loopsUrl}/api/dm/threads/${agent}/messages`, { method: "POST", headers: { cookie, "content-type": "application/json", origin: loopsUrl }, body: JSON.stringify({ bodyMarkdown: `Hello ${agent}, round 28 road 2`, clientId: `r28-road2-seed-${Date.now()}` }) });
  info(`seed: one message from ${admin.id} to ${agent}: ${sent.status}`);
}
if (opts.seed) await seedThread();

const browser = await launch(opts);
const problems = [];
const requests = { on: [], other: [] };

/** The browser's own network log for one page: every request to loops, pre-flights included, with the header NAMES. */
/** The page's own asks: the framed loops app (the Chat panel's iframe, loops' own shell) asks loops too, from its own document. */
const ownAsk = (r) => r.document === "page";
async function recordLoops(page, into, pageOrigin) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const byId = new Map();
  cdp.on("Network.requestWillBeSent", (e) => {
    if (!e.request.url.startsWith(loopsUrl)) return;
    const url = new URL(e.request.url);
    const row = { method: e.request.method, path: url.pathname, query: url.search, initiator: e.initiator?.type ?? "", document: (e.documentURL ?? "").startsWith(pageOrigin) ? "page" : "frame", headerNames: Object.keys(e.request.headers ?? {}).map((h) => h.toLowerCase()) };
    byId.set(e.requestId, row);
    into.push(row);
  });
  cdp.on("Network.requestWillBeSentExtraInfo", (e) => {
    const row = byId.get(e.requestId);
    if (!row) return;
    row.headerNames = [...new Set([...row.headerNames, ...Object.keys(e.headers ?? {}).map((h) => h.toLowerCase())])].sort();
  });
  cdp.on("Network.responseReceived", (e) => {
    const row = byId.get(e.requestId);
    if (row) row.status = e.response.status;
  });
  cdp.on("Network.loadingFailed", (e) => {
    const row = byId.get(e.requestId);
    if (row) row.failed = e.errorText;
  });
}
function listen(page, tag) {
  page.on("pageerror", (e) => problems.push(`[${tag}] pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`[${tag}] console ${m.text()}`));
}
const stores = (p) => p.evaluate(() => (typeof window.__worldStores === "function" ? window.__worldStores() : null)).catch(() => null);
const waitProbe = (p, verdict, timeout = 30000) => p.waitForFunction((v) => window.__worldStores?.().pageChat?.probe === v, verdict, { timeout }).then(() => true).catch(() => false);
const live = (p, timeout = 60000) => p.waitForSelector('.connection-chip[data-connection="live"]', { timeout }).then(() => true).catch(() => false);
async function panelWords(p) {
  await p.locator(".connection-chip").first().click();
  await p.waitForSelector(".connection-chat", { timeout: 10000 }).catch(() => {});
  const el = p.locator(".connection-chat");
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(150);
  const out = { text: (await el.innerText().catch(() => "")).replace(/\s+/g, " ").trim(), probe: await el.getAttribute("data-probe").catch(() => null), road: await el.getAttribute("data-road").catch(() => null) };
  return out;
}
const closePanel = async (p) => {
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
};

try {
  // --- 1. Signed in, on the proof page.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const pg = await ctx.newPage();
  listen(pg, "signed-in");
  await pg.goto(`${loopsUrl}/login`, { waitUntil: "load" });
  await pg.locator("#login-id").fill(admin.id);
  await pg.locator("#login-password").fill(admin.password);
  await pg.locator('form button[type="submit"]').click();
  await pg.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => {});
  const signedIn = !new URL(pg.url()).pathname.startsWith("/login");
  ok("signed in to crewhub-loops through its own login page (the world never sees the password)", signedIn, new URL(pg.url()).pathname);
  await recordLoops(pg, requests.on, host.url);
  await pg.goto(`${host.url}/?source=live`, { waitUntil: "load" });
  const isLive = await live(pg);
  const on = await waitProbe(pg, "on");
  const s1 = await stores(pg);
  ok("the proof page is Live and the page's probe says on: this origin may read the person's chat", isLive && on && s1?.pageChat?.road === "page" && s1?.pageChat?.polling === true, JSON.stringify(s1?.pageChat));
  await shot(pg, "01-town-on");
  const words1 = await panelWords(pg);
  ok("the Connection panel's Chat section says the bubbles come from your own chat, read by this page as you (the contract's words, state/chatRoad)", words1.probe === "on" && words1.road === "page" && /lets this page read the chat as you/.test(words1.text), words1.text.slice(0, 120));
  await shot(pg, "02-panel-on");
  await closePanel(pg);
  await pg.locator(".chat-open").click();
  await pg.waitForSelector(".chat-sheet", { timeout: 5000 }).catch(() => {});
  await pg.locator(".chat-about > summary").click().catch(() => {});
  await pg.waitForTimeout(200);
  const about = (await pg.locator(".chat-sheet-needs").innerText().catch(() => "")).replace(/\s+/g, " ");
  const glance = (await pg.locator(".chat-sheet-todo").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("the Chat panel's glance and About this chat say it too", /lets this page read the chat as you/.test(about) && !/shows no bubbles/.test(glance), `"${glance}"; ${about.slice(0, 80)}`);
  await shot(pg, "03-chat-about-on");
  await pg.keyboard.press("Escape");
  await pg.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
  if (opts["words-only"]) info("--words-only: no reply awaited; the bubble and Recent answers checks are skipped");
  else info(`waiting up to ${Math.round(bubbleTimeoutMs / 1000)} s for ${agent}'s reply as a bubble (the page polls every 5 s)`);
  if (!opts["words-only"]) {
  // The line shows as a bubble over the figure in view, or, for an agent inside a building seen from the town, as the
  // chat mark over that building (round 14): then the mark is tapped, which enters the building, and the bubble is there.
  const bubble = pg.locator(`.bubble.said[data-said-agent="${agent}"]`);
  const mark = pg.locator(`.chat-mark[data-said-mark="${agent}"]`);
  await bubble.or(mark).first().waitFor({ timeout: bubbleTimeoutMs }).catch(() => {});
  const markText = (await mark.getAttribute("title").catch(() => null)) ?? "";
  if (markText !== "") {
    await shot(pg, "04a-mark");
    await mark.click().catch(() => {});
    await bubble.waitFor({ timeout: 10000 }).catch(() => {});
  }
  const said = (await bubble.innerText().catch(() => "")).replace(/\s+/g, " ").trim() || markText.replace(/\s+/g, " ").trim();
  const s2 = await stores(pg);
  ok("the agent's reply shows as a speech bubble over its figure (the chat mark over its building first, when it is inside), read by the page itself (no host in it)", said !== "" && (s2?.pageChat?.lines ?? 0) >= 1, said ? `"${said.slice(0, 100)}"${markText ? " (via the mark)" : ""}; ${JSON.stringify(s2?.pageChat)}` : `no bubble; ${JSON.stringify(s2?.pageChat)}; host: ${hostLines.slice(-3).join(" | ").slice(0, 300)}`);
  await shot(pg, "04-bubble");
  await pg.locator(".chat-open").click();
  await pg.waitForSelector(".chat-recent", { timeout: 5000 }).catch(() => {});
  if (!(await pg.locator(".chat-recent").evaluate((el) => el.open).catch(() => false))) await pg.locator(".chat-recent > summary").click().catch(() => {});
  const recent = (await pg.locator(".chat-recent").innerText().catch(() => "")).replace(/\s+/g, " ");
  const rows = await pg.locator(".recent-row").count();
  ok("and in Recent answers, with its time", rows >= 1 && new RegExp(agent).test((await pg.locator(".recent-row").first().getAttribute("data-answer-agent").catch(() => "")) ?? ""), recent.slice(0, 160));
  await shot(pg, "05-recent-answers");
  await pg.keyboard.press("Escape");
  await pg.waitForSelector(".chat-sheet", { state: "detached", timeout: 5000 }).catch(() => {});
  } else await pg.waitForTimeout(12000); // two polls, so the log holds the poll's shape
  // The request log of the signed-in page.
  const fromPage = requests.on.filter((r) => r.path.startsWith("/api/") && ownAsk(r));
  const fromFrame = requests.on.filter((r) => r.path.startsWith("/api/") && !ownAsk(r));
  const options = fromPage.filter((r) => r.method === "OPTIONS");
  const withAuth = fromPage.filter((r) => r.headerNames.includes("authorization"));
  const notGet = fromPage.filter((r) => r.method !== "GET");
  const FOUR = [/^\/api\/dm\/threads$/, /^\/api\/dm\/threads\/[a-z0-9-]+\/messages$/, /^\/api\/dm\/messages\/[A-Za-z0-9_-]+$/, /^\/api\/events$/];
  const offRoute = fromPage.filter((r) => !FOUR.some((re) => re.test(r.path)));
  const events = fromPage.filter((r) => r.path === "/api/events");
  const badQuery = events.filter((r) => {
    const q = new URLSearchParams(r.query);
    return q.get("types") !== "dm.created,dm.answered" || Number(q.get("limit")) > 50 || q.has("after");
  });
  const sample = fromPage.find((r) => r.path === "/api/dm/threads");
  const ours = (sample?.headerNames ?? []).filter((h) => !["accept", "accept-encoding", "accept-language", "connection", "cookie", "host", "origin", "referer", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "user-agent", "pragma", "cache-control", "priority"].includes(h));
  info(`the framed loops app (the Chat panel's iframe) asked loops ${fromFrame.length} time(s) from its own document; not the page's asks, not counted`);
  ok(`the page's own ${fromPage.length} requests to loops: GET only, no OPTIONS (the browser's own network log lists pre-flights), no authorization header, the four routes only, the events poll with the two types and limit 50`, fromPage.length > 0 && options.length === 0 && withAuth.length === 0 && notGet.length === 0 && offRoute.length === 0 && badQuery.length === 0, `${options.length} OPTIONS, ${withAuth.length} with authorization, ${notGet.length} not GET, ${offRoute.length} off the four routes, ${events.length} events polls (${badQuery.length} with a bad query)`);
  ok("one GET's header names are the browser's own and the cookie: nothing of ours", sample !== undefined && ours.length === 0 && sample.headerNames.includes("cookie"), sample ? sample.headerNames.join(",") : "no threads request seen");
  const statuses = [...new Set(fromPage.map((r) => r.status ?? (r.failed ? `failed:${r.failed}` : "?")))];
  info(`signed in: statuses seen ${statuses.join(", ")}; routes ${[...new Set(fromPage.map((r) => r.path.replace(/\/dm_[A-Za-z0-9_-]+$/, "/<id>")))].join(", ")}`);

  // --- 2. Signed out: a fresh context.
  const out = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const po = await out.newPage();
  listen(po, "signed-out");
  await po.goto(`${host.url}/?source=live`, { waitUntil: "load" });
  const liveOut = await live(po);
  const off = await waitProbe(po, "signed-out");
  const wordsOut = await panelWords(po);
  ok("signed out (a fresh browser context): Live, the probe says signed out and the words say to sign in to crewhub-loops in this browser", liveOut && off && wordsOut.probe === "signed-out" && wordsOut.road === "none" && /signed in to crewhub-loops in this browser/.test(wordsOut.text), wordsOut.text.slice(0, 140));
  await shot(po, "06-signed-out");
  await closePanel(po);
  await out.close();

  // --- 3. Another origin, signed in.
  const px = await ctx.newPage();
  listen(px, "other-origin");
  await recordLoops(px, requests.other, other.url);
  await px.goto(`${other.url}/?source=live`, { waitUntil: "load" });
  const liveOther = await live(px);
  const notSet = await waitProbe(px, "origin-not-set");
  const wordsOther = await panelWords(px);
  const wanted = `CHL_WORLD_ORIGIN=${other.url}`;
  ok(`a page on another origin (${other.url}), signed in: Live, the probe says the origin is not set and the words carry the exact value ${wanted}`, liveOther && notSet && wordsOther.probe === "origin-not-set" && wordsOther.road === "none" && wordsOther.text.includes(wanted), wordsOther.text.slice(0, 160));
  await shot(px, "07-other-origin");
  const otherReqs = requests.other.filter((r) => r.path.startsWith("/api/") && ownAsk(r));
  ok("that page's asks: GETs of the threads only (the credentialed one failed in the browser, the no-cors one answered opaque), no OPTIONS", otherReqs.length >= 2 && otherReqs.every((r) => r.method === "GET" && r.path === "/api/dm/threads"), otherReqs.map((r) => `${r.method} ${r.path} ${r.status ?? r.failed ?? "?"}`).join("; "));
  await closePanel(px);
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  await host.close().catch(() => {});
  await other.close().catch(() => {});
}
writeFileSync(`${opts.out}${opts.tag}-requests.json`, JSON.stringify(requests, null, 2));
const pageErrors = problems.filter((p) => !/other-origin\] console .*(CORS|Failed to load resource)/.test(p) && !/signed-(in|out)\] console .*status of (401|403)/.test(p) && !/signed-out\] console .*Failed to load resource/.test(p));
ok("no page error and no console error beyond the expected refusals (a 401 signed out, the CORS refusal on the other origin)", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ").slice(0, 300));
ok("nothing printed here or kept carries the key or the password", secretFree(JSON.stringify(requests)) && secretFree(hostLines.join("\n")));
console.log(`road2proof: ${passed}/${total}`);
process.exit(passed === total ? 0 : 1);
