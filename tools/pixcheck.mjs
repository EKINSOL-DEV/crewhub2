/* pixcheck.mjs: the proof that a change is pixel-identical, as a tool anyone can rerun (round 24; the scratch rig of
   rounds 15 and 23 made a repository tool). Two builds, each served by `vite preview` on a port of its own (never
   5180; the preview proxies to nothing without CREWHUB_WORLD_PORT, round 16), the same pictures of each, every pair
   diffed on every channel at any delta, one line per pair, a diff image per pair, and `pixcheck: <identical>/<pairs>`
   last; the exit code is 0 only when every pair is 0.

   Usage:
     node tools/pixcheck.mjs --port <base preview port> --head-port <head preview port> --before <commit|dist> --after <commit|dist>
                             [--casts] [--labels] [--theme light,dark] [--width 1440,375] [--seek 120000] [--rooms 3]
                             [--cast-ids <ids>] [--cast-states <ids>] [--cast-views near,far] [--tag pixcheck] [--out <dir>]

   `--before` and `--after` are each a commit (anything `git rev-parse` resolves: a sha, a branch, `HEAD~1`) or a folder
   holding a built world (its `index.html`). A commit is built once under `--out/build-<sha7>/`: its files from
   `git archive`, the repository's `node_modules` linked in (its workspace links pointing into the archive), then
   `vite build` in its `apps/world`; a later run with the same commit reuses the build. The repository's own tree and
   its `apps/world/dist` are never touched.

   The pictures (headless Chromium on Metal, DPR 1, reduced motion, light and dark, 1440 x 900 and 375 x 812):
   - the demo set (always): the demo sought to `--seek` ms and paused (so no walker walks, no clock ticks): the town,
     the town hall (through the jump list), building 0 and each of its `--rooms` rooms, each with the HTML label layer
     out of the layout (the scene alone: the labels' text can jitter between captures, the figures never do; `--labels`
     adds a second picture of each with the labels, `<view>-labels-...`, which may differ by that jitter), and the
     props, tiers and cast preview pages as viewport-sized tiles (a whole-page capture of the props page lost the GPU
     process, round 15; the tiers and cast previews at 1440 only);
   - with `--casts`, the cast set: the casting room (`/cast-preview`) for every cast (`--cast-ids`) in every state
     (`--cast-states`), near and far (`--cast-views`; far: the figures drawn by the robot crowd), with the room's HTML
     note pills hidden from the start (`.cast-labels`; their text jitters between captures, round 23).
   Two runs of one build give 0 differing pixels on every pair (run it with the same build as `--before` and `--after`);
   the labelled pictures of `--labels` are the one exception, by the labels' text.

   Writes under `--out/<tag>/`: `before/`, `after/` (the pictures, the same names), `diff/` (a diff image per pair: grey,
   red where a pixel differs), `<tag>-pairs.json` (every pair's numbers) and `<tag>.log` (the lines).

   Pure diff in lib/pixdiff.ts (PNG in lib/png.ts), tested by scripts/test/pixdiff.test.ts. */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cli, dressed, launch, seek } from "./lib/world.mjs";
import { describeDiff, diffPngFiles } from "./lib/pixdiff.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "node tools/pixcheck.mjs --port <base preview port> --head-port <head preview port> --before <commit|dist> --after <commit|dist> [--casts] [--labels] [--theme light,dark] [--width 1440,375] [--seek 120000] [--rooms 3] [--cast-ids <ids>] [--cast-states <ids>] [--cast-views near,far] [--tag pixcheck] [--out <dir>]";
const opts = cli(USAGE, {
  options: {
    "head-port": "",
    before: "",
    after: "",
    theme: "light,dark",
    width: "1440,375",
    seek: "120000",
    rooms: "3",
    tag: "pixcheck",
    "cast-ids": "classic-bots,overgrown-bots,potlings,sprouts",
    "cast-states": "working,idle,done,blocked,waiting,attention,stale,proxy,walking,carrying",
    "cast-views": "near,far",
  },
  flags: ["casts", "labels"],
});
const headPort = Number(opts["head-port"]);
if (!Number.isInteger(headPort) || headPort <= 0) opts.fail("--head-port <port> is required: the port the head build's preview listens on");
if (headPort === opts.port) opts.fail("--head-port must differ from --port");
if ([opts.port, headPort].some((p) => [5180, 8091, 8000, 9443].includes(p))) opts.fail("never 5180 (the Lead's host) or the Mac app's ports");
if (!opts.before || !opts.after) opts.fail("--before and --after are required: a commit each, or a folder with a built world");
const themes = opts.theme.split(",").map((s) => s.trim()).filter(Boolean);
const widths = opts.width.split(",").map(Number);
if (!themes.length || !widths.every((w) => w === 1440 || w === 375)) opts.fail("--theme light,dark and --width 1440,375 (either or both)");
const OUT = path.join(opts.out, opts.tag);
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** The repository's node_modules linked into an archived tree, its workspace links (`@crewhub/*`) pointing into the archive. */
function linkNodeModules(dir) {
  const root = path.join(REPO, "node_modules");
  const target = path.join(dir, "node_modules");
  mkdirSync(target);
  for (const entry of readdirSync(root)) {
    if (entry === "@crewhub" || entry === ".vite") continue;
    symlinkSync(path.join(root, entry), path.join(target, entry));
  }
  mkdirSync(path.join(target, "@crewhub"));
  // The workspace links are relative ("../../packages/x"): the same link inside the archive points at the archive's package.
  for (const entry of readdirSync(path.join(root, "@crewhub"))) symlinkSync(readlinkSync(path.join(root, "@crewhub", entry)), path.join(target, "@crewhub", entry));
}

/** The built world a `--base`/`--head` names: a folder as it is, a commit built once under --out. */
function distOf(spec, label) {
  if (existsSync(path.join(spec, "index.html"))) return { dist: path.resolve(spec), describe: `${label}: the built world in ${path.resolve(spec)}` };
  let sha;
  try {
    sha = git(["rev-parse", "--verify", `${spec}^{commit}`]).trim();
  } catch {
    opts.fail(`--${label} ${spec}: neither a folder with an index.html nor a commit this repository knows`);
  }
  const short = sha.slice(0, 7);
  const dir = path.join(opts.out, `build-${short}`);
  const dist = path.join(dir, "apps", "world", "dist");
  const stamp = path.join(dir, "built.sha");
  if (existsSync(path.join(dist, "index.html")) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === sha) return { dist, describe: `${label}: ${short} (${git(["log", "-1", "--format=%s", sha]).trim().slice(0, 60)}), built before in ${dir}` };
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const started = Date.now();
  execFileSync("sh", ["-c", `git archive --format=tar "${sha}" | tar -x -C "${dir}"`], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  linkNodeModules(dir);
  const env = { ...process.env };
  delete env.CREWHUB_WORLD_PORT;
  execFileSync("npx", ["vite", "build"], { cwd: path.join(dir, "apps", "world"), env, stdio: ["ignore", "pipe", "pipe"] });
  if (!existsSync(path.join(dist, "index.html"))) opts.fail(`the build of ${short} left no apps/world/dist/index.html under ${dir}`);
  writeFileSync(stamp, `${sha}\n`);
  return { dist, describe: `${label}: ${short} (${git(["log", "-1", "--format=%s", sha]).trim().slice(0, 60)}), built in ${((Date.now() - started) / 1000).toFixed(0)} s under ${dir}` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** True once something accepts a connection on 127.0.0.1:`port` (the preview listening), false after a short wait. */
const listening = (port) =>
  new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });
/** `vite preview` of a built world on `port`, without a host (no CREWHUB_WORLD_PORT: no proxy); stopped by its process group. */
async function preview(dist, port) {
  const env = { ...process.env };
  delete env.CREWHUB_WORLD_PORT;
  const child = spawn("npx", ["vite", "preview", "--outDir", dist, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: path.join(REPO, "apps", "world"), env, stdio: ["ignore", "ignore", "pipe"], detached: true });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) opts.fail(`vite preview on ${port} ended: ${stderr.trim().split("\n").slice(-2).join(" ")}`);
    if (await listening(port)) break;
    await sleep(100);
  }
  return {
    origin,
    close: () => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    },
  };
}

const viewport = (w) => (w === 375 ? { width: 375, height: 812 } : { width: 1440, height: 900 });

/** The demo set of one build: the picture names, in order. */
async function demoSet(origin, dir) {
  const names = [];
  for (const theme of themes) {
    const browser = await launch(opts);
    for (const width of widths) {
      const ctx = await browser.newContext({ viewport: viewport(width), deviceScaleFactor: 1, colorScheme: theme, reducedMotion: "reduce" });
      const p = await ctx.newPage();
      p.on("pageerror", (e) => say(`  PAGEERROR ${theme} ${width}: ${String(e).slice(0, 200)}`));
      const shot = async (view) => {
        if (opts.labels) {
          const labelled = `${view}-labels-${theme}-${width}.png`;
          await p.screenshot({ path: path.join(dir, labelled) });
          names.push(labelled);
        }
        // The label layer out of the layout: `display: none` (a `visibility: hidden` on the layer is undone by the
        // inline `visibility` the labels are placed with; the scratch rig's "label-free" twins of rounds 15 to 23 hid
        // nothing, found in round 24).
        await p.addStyleTag({ content: ".world-labels { display: none !important; }" });
        await p.waitForTimeout(150);
        const name = `${view}-${theme}-${width}.png`;
        await p.screenshot({ path: path.join(dir, name) });
        names.push(name);
        await p.evaluate(() => {
          for (const s of document.querySelectorAll("style")) if (/world-labels \{ display: none/.test(s.textContent ?? "")) s.remove();
        });
        await p.waitForTimeout(150);
      };
      await p.goto(`${origin}/?source=demo`);
      await dressed(p);
      if (!(await seek(p, Number(opts.seek)))) say(`  ${theme} ${width}: no timeline slider to seek`);
      await p.getByRole("button", { name: "Pause", exact: true }).click({ timeout: 3000 }).catch(() => say(`  ${theme} ${width}: no Pause button`));
      await p.waitForTimeout(1500);
      await shot("town");
      await p.locator("canvas").first().focus();
      await p.keyboard.press("/");
      const dialog = p.getByRole("dialog", { name: "Jump to" });
      if (await dialog.waitFor({ timeout: 2000 }).then(() => true, () => false)) {
        await p.keyboard.type("town hall");
        await p.waitForTimeout(300);
        await p.keyboard.press("Enter");
        await p.waitForTimeout(1500);
        await shot("townhall");
        await p.keyboard.press("Escape");
        await p.waitForTimeout(500);
        await p.keyboard.press("Escape");
        await p.waitForTimeout(800);
      } else say(`  ${theme} ${width}: no jump list`);
      await p.locator("canvas").first().focus();
      await p.keyboard.press("Enter");
      await p.waitForTimeout(2000);
      await shot("building");
      for (let r = 0; r < Number(opts.rooms); r++) {
        await p.keyboard.press("ArrowRight");
        await p.keyboard.press("Enter");
        await p.waitForTimeout(1500);
        await shot(`room${r}`);
        await p.keyboard.press("Escape");
        await p.waitForTimeout(500);
      }
      // The preview pages as viewport tiles at fixed scroll offsets.
      for (const page of width === 375 ? ["props-preview"] : ["props-preview", "tiers-preview", "cast-preview"]) {
        const q = await ctx.newPage();
        q.on("pageerror", (e) => say(`  PAGEERROR ${page} ${theme} ${width}: ${String(e).slice(0, 200)}`));
        await q.goto(`${origin}/${page}`);
        await q.waitForSelector("canvas", { timeout: 30000 }).catch(() => say(`  ${page} ${theme} ${width}: no canvas`));
        await q.waitForTimeout(4000);
        const height = await q.evaluate(() => document.documentElement.scrollHeight);
        const step = viewport(width).height;
        const tiles = Math.min(12, Math.ceil(height / step));
        for (let t = 0; t < tiles; t++) {
          await q.evaluate((y) => window.scrollTo(0, y), t * step);
          await q.waitForTimeout(700);
          const name = `${page}-t${t}-${theme}-${width}.png`;
          await q.screenshot({ path: path.join(dir, name) });
          names.push(name);
        }
        await q.close();
      }
      await ctx.close();
    }
    await browser.close();
  }
  return names;
}

/** The cast set of one build: every cast in every state, near and far, the note pills hidden from the start. */
async function castSet(origin, dir) {
  const names = [];
  for (const theme of themes) {
    const browser = await launch(opts);
    for (const width of widths) {
      const ctx = await browser.newContext({ viewport: viewport(width), deviceScaleFactor: 1, colorScheme: theme, reducedMotion: "reduce" });
      const p = await ctx.newPage();
      p.on("pageerror", (e) => say(`  PAGEERROR casts ${theme} ${width}: ${String(e).slice(0, 200)}`));
      for (const cast of opts["cast-ids"].split(","))
        for (const state of opts["cast-states"].split(","))
          for (const view of opts["cast-views"].split(",")) {
            await p.goto(`${origin}/cast-preview?cast=${cast}&state=${state}&scene=desks&motion=reduced&labels=0${view === "far" ? "&view=far" : ""}`);
            await p.addStyleTag({ content: ".cast-labels { visibility: hidden !important; }" });
            await p.waitForSelector("canvas", { timeout: 30000 }).catch(() => say(`  ${cast} ${state} ${view} ${theme} ${width}: no canvas`));
            await p.waitForTimeout(2500);
            const name = `cast-${cast}-${state}-${view}-${theme}-${width}.png`;
            await p.screenshot({ path: path.join(dir, name) });
            names.push(name);
          }
      await ctx.close();
    }
    await browser.close();
  }
  return names;
}

const started = Date.now();
const base = distOf(opts.before, "before");
const head = distOf(opts.after, "after");
say(base.describe);
say(head.describe);
for (const sub of ["before", "after", "diff"]) mkdirSync(path.join(OUT, sub), { recursive: true });
const servers = [];
let pairs = [];
try {
  const sides = [
    { side: "before", dist: base.dist, port: opts.port },
    { side: "after", dist: head.dist, port: headPort },
  ];
  const names = {};
  for (const { side, dist, port } of sides) {
    const server = await preview(dist, port);
    servers.push(server);
    const t0 = Date.now();
    const dir = path.join(OUT, side);
    const taken = await demoSet(server.origin, dir);
    if (opts.casts) taken.push(...(await castSet(server.origin, dir)));
    names[side] = taken;
    say(`${side}: ${taken.length} pictures in ${((Date.now() - t0) / 1000).toFixed(0)} s (${server.origin})`);
    server.close();
  }
  if (names.before.join("\n") !== names.after.join("\n")) say(`the two sides took different pictures (${names.before.length} against ${names.after.length}): the pairs below are those both have`);
  const both = names.before.filter((n) => names.after.includes(n));
  let identical = 0;
  for (const name of both) {
    let result;
    try {
      result = diffPngFiles(path.join(OUT, "before", name), path.join(OUT, "after", name), path.join(OUT, "diff", name));
    } catch (e) {
      say(`${name}: ${e.message}`);
      pairs.push({ name, error: e.message });
      continue;
    }
    if (result.diff === 0) identical++;
    say(`${name}: ${describeDiff(result)}${result.diff ? ` (diff/${name})` : ""}`);
    pairs.push({ name, ...result });
  }
  writeFileSync(path.join(OUT, `${opts.tag}-pairs.json`), JSON.stringify({ before: base.describe, after: head.describe, pairs }, null, 1));
  say(`pixcheck: ${identical}/${both.length} identical${both.length ? "" : " (no pairs)"} in ${((Date.now() - started) / 1000).toFixed(0)} s; pictures and diffs under ${OUT}`);
  writeFileSync(path.join(OUT, `${opts.tag}.log`), `${log.join("\n")}\n`);
  process.exitCode = both.length > 0 && identical === both.length ? 0 : 1;
} finally {
  for (const server of servers) server.close();
}
