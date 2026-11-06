/* Design choice L1 (`own-words`, round 72), two edges round 73's mutation run found unpinned: a 503 whose body is not
   JSON (a proxy's page, an empty body) is Loops down with no reason, nothing throws and the source keeps asking; and
   the host's reason is published again when it changes while the state stays the same (a second host-tabs 503 with
   other words). A small in-test host on 127.0.0.1 port 0, as hostSource.test.ts has one. */
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { createHostSource } from "../src/hostSource.ts";
import { worldApiPath } from "../src/hostWire.ts";
import type { ConnectionState } from "../src/source.ts";

const TIMINGS = { staleMs: 60_000, teamPollMs: 60_000, retryMinMs: 10, retryMaxMs: 20 };
const CEILING_MS = 30_000;

interface Refusal {
  /** The snapshot's answer: a JSON body, or raw text with its content type. */
  json?: { error: string; message?: string };
  raw?: { type: string; body: string };
}

const servers: Server[] = [];
const stops: (() => void)[] = [];
after(async () => {
  for (const stop of stops) stop();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

/** A host whose snapshot is refused 503 with `refusal()` (null: answered 200 would need a fixture; these rows never get there). */
async function refusingHost(refusal: () => Refusal): Promise<{ url: string; snapshots: number; close(): Promise<void> }> {
  const host = { url: "", snapshots: 0, close: () => new Promise<void>((resolve) => (server.closeAllConnections(), server.close(() => resolve()))) };
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", host.url);
    if (url.pathname === worldApiPath("/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ loops: "ok", keyName: "agent-crewhub-world", sharedKey: false, cursor: 1, loopsWebUrl: "http://127.0.0.1:1", transport: "unix" }));
    }
    if (url.pathname === worldApiPath("/snapshot")) {
      host.snapshots += 1;
      const r = refusal();
      if (r.raw) {
        res.writeHead(503, { "content-type": r.raw.type });
        return res.end(r.raw.body);
      }
      res.writeHead(503, { "content-type": "application/json" });
      return res.end(JSON.stringify(r.json));
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  host.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return host;
}

function observe(url: string) {
  const states: ConnectionState[] = [];
  const source = createHostSource({ baseUrl: url }, { timings: TIMINGS });
  source.connection!.onChange(() => states.push(source.connection!.state()));
  const stop = source.start(() => undefined);
  stops.push(stop);
  const until = async (check: () => boolean, what: string): Promise<void> => {
    const deadline = Date.now() + CEILING_MS;
    while (!check()) {
      if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}; states ${states.join(",")}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  };
  return { source, states, stop, until, state: () => source.connection!.state(), reason: () => source.connection!.reason() };
}

test("L1: a 503 whose body is not JSON is Loops down with no reason, and the source keeps asking", async () => {
  const host = await refusingHost(() => ({ raw: { type: "text/html", body: "<h1>503 Service Unavailable</h1>" } }));
  const run = observe(host.url);
  await run.until(() => run.state() === "loops-down", "loops-down");
  assert.equal(run.reason(), null);
  const asked = host.snapshots;
  await run.until(() => host.snapshots >= asked + 2, "two more asks");
  assert.equal(run.state(), "loops-down", "still Loops down, nothing thrown");
  assert.ok(!run.states.includes("host-tabs") && !run.states.includes("host-failed"), `never the host's own states: ${run.states.join(",")}`);
  run.stop();
  await host.close();
});

test("L1: the host's reason is published again when its words change while the state stays host-tabs", async () => {
  let message = "This host holds 64 tabs on its stream already; close one";
  const host = await refusingHost(() => ({ json: { error: "too_many_tabs", message } }));
  const run = observe(host.url);
  await run.until(() => run.state() === "host-tabs", "host-tabs");
  assert.equal(run.reason(), "This host holds 64 tabs on its stream already; close one");
  const changes = run.states.length;
  message = "This host holds 64 tabs on its stream already; close two";
  await run.until(() => run.reason() === "This host holds 64 tabs on its stream already; close two", "the new words");
  assert.equal(run.state(), "host-tabs");
  assert.ok(run.states.length > changes, "the change was published (onChange)");
  run.stop();
  await host.close();
});
