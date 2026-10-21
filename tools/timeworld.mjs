/* timeworld.mjs: how long `npm run world` takes until the town stands with the real buildings, step by step.

   Usage:
     node tools/timeworld.mjs --port 5194 [--cold] [--runs 1] [--fake 8393 [--scenario studio]] [--loops-env <file>]
                              [--app-data <dir>] [--config-dir <dir>] [--out <dir>] [--tag time] [--json <file>] [--swiftshader]

   What it does: runs the real command (`npm run world -- --no-open`, through npm, as a person types it) with a port of
   its own, stamps every line the host prints, takes the pairing link from stdout, opens it in a headless browser and
   watches the page until the town is drawn and dressed and the text view names every project. One line per step with
   the time since `npm run world` started, and the host's own step lines (`[host] ✓ ...`) when the host prints them.

     --cold            removes `apps/world/dist` first (a build output, git-ignored), so the run includes the build.
     --runs <n>        repeats the run (warm after the first); the table has every run.
     --fake <port>     starts a fake crewhub-loops (`packages/loops-fake`) on that port and points the host at it
                       (`--scenario`, default `studio`: twenty projects); without it the host finds the development
                       crewhub-loops through `--app-data` (default `~/crewhub-loops-dev`) and reads the key file named in
                       `--loops-env` (`LOOPS_DEV_KEY_FILE`; default: the first tools/out/loops-dev.env found, as regress.mjs).
     --app-data <dir>  the folder the host's discovery reads (`CREWHUB_WORLD_LOOPS_APP_DATA`); never the Mac app's.
     --config-dir <dir> the host's own folder (`CREWHUB_WORLD_CONFIG_DIR`); default <out>/timeworld-config.
     --json <file>     every number, per run.
   The port (`--port`) is the host's, must be free and yours; the browser opens the host directly. The host is stopped by its own pid at the end, never by a pattern.
   Loopback only. The key is never printed. */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cli, launch } from "./lib/world.mjs";

const USAGE =
  "node tools/timeworld.mjs --port <port> [--cold] [--runs 1] [--fake <port> [--scenario studio]] [--loops-env <file>] [--app-data <dir>] [--config-dir <dir>] [--out <dir>] [--tag time] [--json <file>] [--swiftshader]";
const opts = cli(USAGE, { options: { runs: "1", fake: "", scenario: "studio", "loops-env": "", "app-data": "", "config-dir": "", json: "", tag: "time" }, flags: ["cold"] });
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hostPort = opts.port;
const runs = Number(opts.runs);
if (!Number.isInteger(runs) || runs <= 0) opts.fail("--runs must be a count");
const dist = path.join(REPO, "apps", "world", "dist");
const configDir = opts["config-dir"] || path.join(opts.out, "timeworld-config");
mkdirSync(opts.out, { recursive: true });

/** The env of the real command: never the app's folder, never 8091; the key file, never the key. */
async function environment() {
  const env = { ...process.env, CREWHUB_WORLD_PORT: String(hostPort), CREWHUB_WORLD_CONFIG_DIR: configDir };
  delete env.CREWHUB_WORLD_LOOPS_URL;
  delete env.CREWHUB_WORLD_LOOPS_SOCKET;
  if (opts.fake) {
    const { createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href);
    const fake = await createLoopsFake({ port: Number(opts.fake), scenario: opts.scenario, speed: 0 });
    const keyFile = path.join(opts.out, "timeworld-fake.key");
    writeFileSync(keyFile, fake.key + "\n", { mode: 0o600 });
    env.CREWHUB_WORLD_LOOPS_URL = fake.url;
    env.CREWHUB_WORLD_KEY_FILE = keyFile;
    return { env, fake, what: `the fake on ${fake.url} (${opts.scenario})` };
  }
  const envFile = opts["loops-env"] || [path.join(REPO, "tools", "out", "loops-dev.env"), (() => {
    try {
      const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: REPO, encoding: "utf8" }).trim();
      return path.join(path.resolve(REPO, common), "..", "tools", "out", "loops-dev.env");
    } catch {
      return "";
    }
  })()].find((f) => f && existsSync(f));
  if (!envFile) opts.fail("no loops env found: --loops-env <file> or --fake <port>");
  const lines = Object.fromEntries(readFileSync(envFile, "utf8").split("\n").filter((l) => /^LOOPS_DEV_(URL|KEY_FILE)=/.test(l)).map((l) => l.split("=", 2)));
  if (!lines.LOOPS_DEV_KEY_FILE) opts.fail(`${envFile} has no LOOPS_DEV_KEY_FILE`);
  env.CREWHUB_WORLD_KEY_FILE = lines.LOOPS_DEV_KEY_FILE.replace(/^~/, process.env.HOME ?? "");
  env.CREWHUB_WORLD_LOOPS_APP_DATA = (opts["app-data"] || path.join(process.env.HOME ?? "", "crewhub-loops-dev")).replace(/^~/, process.env.HOME ?? "");
  return { env, fake: null, what: `crewhub-loops found in ${env.CREWHUB_WORLD_LOOPS_APP_DATA}` };
}

const ms = (t) => `${String(Math.round(t)).padStart(6)} ms`;

/** One run: the command, the link, the page, the town. Resolves with the steps. */
async function run(env, browser, index) {
  const steps = [];
  const t0 = Date.now();
  const at = (name, detail = "") => {
    const t = Date.now() - t0;
    steps.push({ name, ms: t, detail });
    console.log(`  ${ms(t)}  ${name}${detail ? "  " + detail : ""}`);
  };
  const hostLines = [];
  const child = spawn("npm", ["run", "world", "--", "--no-open"], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let link = null;
  let resolveLink;
  const linkPromise = new Promise((resolve) => (resolveLink = resolve));
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    const m = stdout.match(/https?:\/\/127\.0\.0\.1:\d+\/pair\/[A-Za-z0-9_-]+/);
    if (m && link === null) {
      link = m[0];
      at("link printed (the host listens)");
      resolveLink(link);
    }
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    let nl;
    while ((nl = stderr.indexOf("\n")) >= 0) {
      const line = stderr.slice(0, nl);
      stderr = stderr.slice(nl + 1);
      hostLines.push({ ms: Date.now() - t0, line });
      if (/^(\[host\]|  [✓✗…·])/.test(line)) console.log(`  ${ms(Date.now() - t0)}  host: ${line.replace(/^\[host\] /, "").trim().slice(0, 150)}`);
    }
  });
  const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));
  const got = await Promise.race([linkPromise, exited.then(() => null), new Promise((r) => setTimeout(() => r(null), 180_000))]);
  if (got === null) {
    console.log(`  no link within the wait; stdout: ${stdout.slice(0, 300)}`);
    try {
      process.kill(-child.pid, "SIGINT");
    } catch {}
    return { steps, hostLines, failed: true };
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console ${m.text()}`));
  await page.goto(link, { waitUntil: "domcontentloaded" });
  at("page loaded (after the pairing redirect)");
  // The chip's states as they come, the canvas, the dressed town, the text view with every project.
  const seen = new Set();
  const deadline = Date.now() + 120_000;
  let canvasAt = null;
  let dressedAt = null;
  let projects = 0;
  while (Date.now() < deadline) {
    const now = await page
      .evaluate(() => ({
        chip: document.querySelector(".connection-chip")?.getAttribute("data-connection") ?? null,
        status: [...document.querySelectorAll('[role="status"]')].map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 3),
        canvas: !!document.querySelector("canvas"),
        dressed: performance.getEntriesByName("world:town-dressed").length > 0,
        buildings: globalThis.__town?.buildings?.length ?? null,
        jump: [...document.querySelectorAll(".jump-list li, [data-building]")].length,
      }))
      .catch(() => null);
    if (now === null) break;
    for (const s of now.status) if (!seen.has("s:" + s)) (seen.add("s:" + s), at("page says", JSON.stringify(s.slice(0, 80))));
    if (now.chip && !seen.has("c:" + now.chip)) (seen.add("c:" + now.chip), at(`chip: ${now.chip}`));
    if (now.canvas && canvasAt === null) (canvasAt = true, at("canvas on screen"));
    if (now.dressed && dressedAt === null) {
      dressedAt = true;
      at("town drawn and dressed (world:town-dressed)");
    }
    if (now.dressed && now.chip === "live") break;
    await page.waitForTimeout(50);
  }
  // The text view names every project the host's snapshot has (the page's request carries the pairing cookie).
  const origin = new URL(link).origin;
  const snapshot = await page.request.get(`${origin}/world-api/snapshot`).then((r) => (r.ok() ? r.json() : null)).catch(() => null);
  const names = (snapshot?.projects ?? []).map((p) => `${p.name} (${p.key})`);
  await page.keyboard.press("t");
  await page.waitForTimeout(300);
  const tv = (await page.locator("#text-view").innerText().catch(() => "")) ?? "";
  await page.keyboard.press("Escape");
  projects = names.filter((n) => tv.includes(n)).length;
  at("text view read", `${projects} of ${names.length} projects named; ${/Demo mode/.test(tv) ? "DEMO MODE" : "live"}`);
  const marks = await page.evaluate(() => performance.getEntriesByType("mark").map((m) => ({ name: m.name, ms: Math.round(m.startTime) })));
  for (const mark of marks.filter((m) => /^world:(snapshot|town-dressed)$/.test(m.name))) console.log(`  page mark ${mark.name} at ${mark.ms} ms after navigation`);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return n ? { responseEnd: Math.round(n.responseEnd), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
  });
  await page.screenshot({ path: path.join(opts.out, `${opts.tag}-${index}-town.png`) }).catch(() => {});
  await ctx.close();
  try {
    process.kill(-child.pid, "SIGINT");
  } catch {}
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  at("host stopped");
  return { steps, hostLines, marks, nav, projects, problems, failed: false };
}

const { env, fake, what } = await environment();
const browser = await launch(opts);
const results = [];
try {
  for (let i = 1; i <= runs; i += 1) {
    const cold = opts.cold && i === 1;
    if (cold) rmSync(dist, { recursive: true, force: true });
    console.log(`run ${i} (${cold ? "cold: no apps/world/dist" : existsSync(path.join(dist, "index.html")) ? "warm: apps/world/dist exists" : "no dist"}) against ${what}, host on 127.0.0.1:${hostPort}`);
    results.push({ run: i, cold, ...(await run(env, browser, i)) });
    const last = results[results.length - 1];
    if (last.problems?.length) console.log(`  page problems: ${last.problems.join(" | ")}`);
  }
} finally {
  await browser.close();
  await fake?.close?.();
  const stale = path.join(tmpdir(), `crewhub-world-host-${hostPort}.json`);
  if (existsSync(stale)) rmSync(stale, { force: true });
}
if (opts.json) writeFileSync(opts.json, JSON.stringify({ what, hostPort, results }, null, 2) + "\n");
const failed = results.some((r) => r.failed || r.projects === 0);
console.log("  (project lines: of the host's snapshot, named in the text view)");
console.log(failed ? "timeworld: the town did not come up in every run" : `timeworld: ${results.length} run(s) done`);
process.exit(failed ? 1 : 0);
