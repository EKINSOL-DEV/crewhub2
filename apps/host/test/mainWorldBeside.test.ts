/* Design choice H2 (round 72, `refuse`), main.ts's road, which worldBesideHost.test.ts says has no test seam: it has
   one after all, the child run mainStart.test.ts uses. (1) `world --no-open` beside a running host: the host on the port
   is the test's own port-0 listener answering `/pair-mint` with a link for the run file's secret, and the run file is
   the test's (its TMPDIR); a run file that says `world: false` gets the refusal on stderr, exit 1 and no link; `world:
   true` or a file from before gets the link on stdout as before, exit 0. (2) A development host started on port 0
   writes a run file that says `world: false`, read when the host says it listens, and removes it at exit. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MINT_HEADER, MINT_PATH } from "../src/runningHost.ts";

const MAIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "main.ts");
const SECRET = "s3cret";

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

/** A child run to its end, the test's loop free meanwhile (the fake host answers from it; spawnSync would block it). */
const run = (args: string[], env: Record<string, string>) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [MAIN, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => child.kill(), 20000);
    child.on("exit", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });

/** A folder, key file and app-data folder of the test's own; the child's env points at them and nowhere else. */
function scratch(port: number) {
  const base = mkdtempSync(path.join(tmpdir(), "chw-world-beside-"));
  const own = path.join(base, "own");
  mkdirSync(own, { mode: 0o700 });
  const keyFile = path.join(base, "agent-crewhub-world.key");
  writeFileSync(keyFile, `chl_${"x".repeat(32)}\n`, { mode: 0o600 });
  const appData = path.join(base, "app-data");
  mkdirSync(appData);
  writeFileSync(path.join(appData, "settings.json"), JSON.stringify({ port }));
  const env = { PATH: process.env.PATH ?? "", NODE_OPTIONS: process.env.NODE_OPTIONS ?? "", TMPDIR: base, CREWHUB_WORLD_CONFIG_DIR: own, CREWHUB_WORLD_LOOPS_APP_DATA: appData, CREWHUB_WORLD_KEY_FILE: keyFile, CREWHUB_WORLD_LOOPS_URL: "http://127.0.0.1:1", CREWHUB_WORLD_PAIRING: "off" };
  return { base, env, runFile: (p: number) => path.join(base, `crewhub-world-host-${p}.json`) };
}

describe("npm run world beside a running host, main.ts's road (H2, refuse)", () => {
  it("refuses a development host with its line, exit 1 and no link; mints the link beside a world host or a host from before", async () => {
    const asks: string[] = [];
    const fake = createServer((req, res) => {
      asks.push(`${req.url} ${req.headers[MINT_HEADER] === SECRET ? "secret" : "no secret"}`);
      if (req.url === MINT_PATH && req.headers[MINT_HEADER] === SECRET) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ link: `http://127.0.0.1:${port}/#pair=abc` }));
      } else {
        res.writeHead(403);
        res.end();
      }
    });
    const port = await listen(fake);
    const s = scratch(port);
    try {
      // `world` runs as production, where pairing off is refused: the default pairing stands (its secret is read after the exit here).
      const env: Record<string, string> = { ...s.env, CREWHUB_WORLD_PORT: String(port) };
      delete env.CREWHUB_WORLD_PAIRING;
      const world = () => run(["world", "--no-open"], env);
      const file = (world: boolean | undefined) => writeFileSync(s.runFile(port), JSON.stringify({ pid: process.pid, url: `http://127.0.0.1:${port}`, mintSecret: SECRET, ...(world === undefined ? {} : { world }) }));
      file(false);
      const refused = await world();
      assert.equal(refused.status, 1, refused.stderr);
      assert.match(refused.stderr, new RegExp(`^\\s*· a development host \\(npm run host\\) runs on ${port} and serves no built world: stop it \\(Ctrl\\+C in its terminal\\), or open your Vite page \\(npm run dev\\)$`, "m"));
      assert.doesNotMatch(refused.stderr, /already runs on/, "not the link's words");
      assert.equal(refused.stdout, "", "no link");
      assert.deepEqual(asks, [`${MINT_PATH} secret`], "the link was minted once, with the run file's secret, before the refusal");
      file(true);
      const minted = await world();
      assert.equal(minted.status, 0, minted.stderr);
      assert.match(minted.stdout, new RegExp(`^http://127\\.0\\.0\\.1:${port}/#pair=abc$`, "m"), "the link, as before");
      assert.match(minted.stderr, new RegExp(`a host already runs on ${port}; open this link in the browser`));
      assert.doesNotMatch(minted.stderr, /serves no built world/);
      file(undefined);
      const before = await world();
      assert.equal(before.status, 0, before.stderr);
      assert.match(before.stdout, new RegExp(`^http://127\\.0\\.0\\.1:${port}/#pair=abc$`, "m"), "a run file from before: as before");
      assert.equal(asks.length, 3);
    } finally {
      await close(fake);
      rmSync(s.base, { recursive: true, force: true });
    }
  });

  it("a development host's run file says world: false while it runs, and goes at its exit", async () => {
    const decoy = createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const s = scratch(await listen(decoy));
    try {
      const child = spawn(process.execPath, [MAIN], { env: { ...s.env, CREWHUB_WORLD_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
      let text = "";
      const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));
      const port = await new Promise<number | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 15000);
        child.stderr.on("data", (chunk: Buffer) => {
          text += chunk.toString();
          const m = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(text);
          if (m) {
            clearTimeout(timer);
            resolve(Number(m[1]));
          }
        });
        void exited.then(() => {
          clearTimeout(timer);
          resolve(null);
        });
      });
      try {
        assert.ok(port !== null, `the host listened: ${text}`);
        const file = JSON.parse(readFileSync(s.runFile(port), "utf8")) as Record<string, unknown>;
        assert.equal(file.world, false, "a development host serves no built world");
        assert.equal(file.pid, child.pid);
        assert.equal(file.url, `http://127.0.0.1:${port}`);
        assert.ok(typeof file.mintSecret === "string" && file.mintSecret !== "");
      } finally {
        child.kill();
        await exited;
      }
      assert.equal(existsSync(s.runFile(port)), false, "removed at exit");
    } finally {
      await close(decoy);
      rmSync(s.base, { recursive: true, force: true });
    }
  });
});
