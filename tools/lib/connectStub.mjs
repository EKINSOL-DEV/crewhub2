/* A stub of the world's host for the Connect screens (spec addendum "a smooth connection"): answers `/world-api/health`
   in a chosen state, takes `POST /world-api/connect` (a key starting with `chl_bad` is rejected, any other shaped key is
   checked for a moment and then connected; the key itself is read and dropped, never logged) and `DELETE /world-api/connect`
   (back to the connect state). In the `connected` state everything else under `/world-api` goes to a real host (apps/host,
   pairing off) over the fake crewhub-loops (packages/loops-fake), both started here on 127.0.0.1, so the town is real.

   Tooling only, like everything in tools/: it listens on 127.0.0.1 and reaches nothing but the fake and the host it starts. */
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const STUB_STATES = ["no-loops", "pair", "connect", "checking", "rejected", "loops-down", "connected", "older"];
const APP_PORT_TARGET = "http://127.0.0.1:8091";
const APP_SOCKET_TARGET = "~/Library/Application Support/be.ekinsol.crewhub/run/api.sock";
const REJECT_REASON = "crewhub-loops answered 403 for GET /api/team: a Read only key cannot read the team. Make an external bot with Read only off.";

/**
 * Starts the stub on `port` (0 picks one). `origin` is the Vite origin the inner host must allow. `checkMs` is how long a
 * pasted key is "checking" before it connects. Returns { url, port, state, setState, close }.
 */
export async function createConnectStub({ port = 0, state = "no-loops", origin, checkMs = 1500, log = () => undefined } = {}) {
  if (!STUB_STATES.includes(state)) throw new Error(`unknown stub state ${state}`);
  let current = state;
  let inner = null; // { fake, host } once the connected state needs them
  let startedAt = Date.now();
  let lastEventAt = null;
  let reconnects = 2;
  let pending = null;

  async function ensureInner() {
    if (inner) return inner;
    const { createLoopsFake } = await import(pathToFileURL(path.join(REPO, "packages", "loops-fake", "src", "index.ts")).href);
    const { createHost } = await import(pathToFileURL(path.join(REPO, "apps", "host", "src", "host.ts")).href);
    const fake = await createLoopsFake({ heartbeatMs: 1000, speed: 16 });
    const host = await createHost({ loopsUrl: fake.url, key: fake.key, keyName: fake.keyName, pairing: "off", retryMs: { min: 100, max: 500 }, heartbeatMs: 1000, log, ...(origin ? { allowedOrigins: [origin] } : {}) });
    inner = { fake, host };
    lastEventAt = new Date().toISOString();
    return inner;
  }

  async function health() {
    const base = { keyName: "", sharedKey: false, pairing: "on", transport: "tcp" };
    switch (current) {
      case "older": {
        const { fake, host } = await ensureInner();
        let real = null;
        try {
          real = await (await fetch(`${host.url}/world-api/health`)).json();
        } catch {
          real = null;
        }
        return { loops: real?.loops ?? "ok", keyName: "crewhub-world", sharedKey: false, pairing: "on", paired: true, transport: "tcp", loopsWebUrl: fake.url, cursor: real?.cursor ?? 0 };
      }
      case "no-loops":
        return { ...base, loops: "down", paired: false, connection: { discovery: { state: "searching" }, key: { state: "none" }, stream: { state: "idle", reconnects: 0 } } };
      case "pair":
        return { ...base, loops: "down", paired: false, connection: { discovery: { state: "found" }, key: { state: "none" }, stream: { state: "idle", reconnects: 0 } } };
      case "connect":
        return { ...base, loops: "down", paired: true, loopsWebUrl: APP_PORT_TARGET, connection: { discovery: { state: "found", via: "app-port", target: APP_PORT_TARGET }, key: { state: "none" }, stream: { state: "idle", reconnects: 0 } } };
      case "checking":
        return { ...base, loops: "down", keyName: "crewhub-world", paired: true, loopsWebUrl: APP_PORT_TARGET, connection: { discovery: { state: "found", via: "app-port", target: APP_PORT_TARGET }, key: { state: "checking", name: "crewhub-world", source: "stored" }, stream: { state: "idle", reconnects: 0 } } };
      case "loops-down":
        return { ...base, loops: "down", keyName: "crewhub-world", paired: true, loopsWebUrl: APP_PORT_TARGET, cursor: 41, connection: { discovery: { state: "found", via: "app-port", target: APP_PORT_TARGET }, key: { state: "ok", name: "crewhub-world", source: "stored" }, stream: { state: "down", cursor: 41, lastEventAt: new Date(Date.now() - 400_000).toISOString(), reconnects: 3 } } };
      case "rejected":
        return { ...base, loops: "unauthorized", keyName: "crewhub-world", paired: true, loopsWebUrl: APP_PORT_TARGET, connection: { discovery: { state: "found", via: "app-port", target: APP_PORT_TARGET }, key: { state: "rejected", name: "crewhub-world", source: "stored", reason: REJECT_REASON }, stream: { state: "unauthorized", reconnects: 0 } } };
      case "connected": {
        const { fake, host } = await ensureInner();
        let real = null;
        try {
          real = await (await fetch(`${host.url}/world-api/health`)).json();
        } catch {
          real = null;
        }
        const cursor = typeof real?.cursor === "number" ? real.cursor : fake.lastSeq();
        if (typeof real?.cursor === "number" && real.cursor > 0) lastEventAt = lastEventAt ?? new Date().toISOString();
        return {
          loops: real?.loops ?? "ok",
          keyName: "crewhub-world",
          sharedKey: false,
          pairing: "on",
          paired: true,
          transport: "unix",
          loopsWebUrl: fake.url,
          loopsCommit: real?.loopsCommit,
          cursor,
          connection: {
            discovery: { state: "found", via: "app-socket", target: APP_SOCKET_TARGET },
            key: { state: "ok", name: "crewhub-world", source: "stored" },
            stream: { state: real?.loops ?? "ok", cursor, lastEventAt: new Date(Date.now() - 23_000).toISOString(), reconnects },
          },
        };
      }
      default:
        throw new Error(`unknown stub state ${current}`);
    }
  }

  function send(res, status, body) {
    const text = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(text);
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let text = "";
      req.on("data", (chunk) => (text += chunk.toString()));
      req.on("end", () => resolve(text));
    });
  }

  async function connect(req, res) {
    const text = await readBody(req);
    let key = "";
    try {
      key = String(JSON.parse(text)?.key ?? "");
    } catch {
      return send(res, 400, { error: "bad_request", message: "the body is not JSON" });
    }
    if (!(await health()).paired) return send(res, 401, { error: "not_paired" });
    if (!/^chl_[A-Za-z0-9_-]{20,}$/.test(key)) return send(res, 400, { error: "bad_request", message: "key missing or not a key" });
    if (key.startsWith("chl_bad")) {
      current = "rejected";
      log(`connect: a key ending in …${key.slice(-4)} rejected`);
      return send(res, 403, { error: "rejected", reason: REJECT_REASON });
    }
    log(`connect: a key ending in …${key.slice(-4)} accepted; checking for ${checkMs} ms`);
    current = "checking";
    clearTimeout(pending);
    pending = setTimeout(() => {
      current = "connected";
      reconnects = 0;
    }, checkMs);
    send(res, 204);
  }

  function proxy(req, res, target) {
    const url = new URL(target);
    const upstream = httpRequest(
      { host: url.hostname, port: url.port, method: req.method, path: req.url, headers: { ...req.headers, host: url.host, "accept-encoding": "identity" } },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) send(res, 502, { error: "stub_proxy" });
      else res.end();
    });
    req.pipe(upstream);
    res.on("close", () => upstream.destroy());
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/world-api/health" && req.method === "GET") return send(res, 200, await health());
    if (url.pathname === "/world-api/connect" && req.method === "POST") return connect(req, res);
    if (url.pathname === "/world-api/connect" && req.method === "DELETE") {
      current = "connect";
      log("connect: the stored key forgotten");
      return send(res, 204);
    }
    if (url.pathname === "/__stub/state" && req.method === "POST") {
      const text = await readBody(req);
      const next = (() => {
        try {
          return JSON.parse(text)?.state;
        } catch {
          return undefined;
        }
      })();
      if (!STUB_STATES.includes(next)) return send(res, 400, { error: "bad_state", known: STUB_STATES });
      await setState(next);
      return send(res, 200, { state: current });
    }
    if (url.pathname.startsWith("/world-api/")) {
      if (current !== "connected" && current !== "older") return send(res, 503, { error: current === "rejected" ? "unauthorized" : "loops_down" });
      const { host } = await ensureInner();
      return proxy(req, res, host.url);
    }
    send(res, 404, { error: "not_found" });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const actual = server.address().port;

  async function setState(next) {
    if (!STUB_STATES.includes(next)) throw new Error(`unknown stub state ${next}`);
    clearTimeout(pending);
    current = next;
    startedAt = Date.now();
    if (next === "connected" || next === "older") await ensureInner();
  }

  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    get state() {
      return current;
    },
    get startedAt() {
      return startedAt;
    },
    setState,
    async close() {
      clearTimeout(pending);
      await new Promise((resolve) => server.close(() => resolve()));
      if (inner) {
        await inner.host.close();
        await inner.fake.close();
      }
    },
  };
}
