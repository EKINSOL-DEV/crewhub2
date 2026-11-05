/**
 * Walk finding w3-6 (round 64), the browser's source on the real host: loops linked but silent (frozen, not closed). The
 * host answers a reopened stream at once from its own memory, so what the source hears on it must not say Live; loops'
 * next heartbeat does. Pairing off, the stub on port 0, the host's own idle guard far away (45 s).
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createHostSource } from "@crewhub/loops-client";
import type { ConnectionState } from "@crewhub/loops-client";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { testHost } from "./testHost.ts";
import { waitFor } from "./wait.ts";

const TIMINGS = { staleMs: 300, teamPollMs: 60_000, retryMinMs: 10, retryMaxMs: 20 };

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

test("a silent loops: the source goes Stale, the host answers the reopened stream, Live waits for loops' heartbeat", async () => {
  const stub = await createLoopsStub(installation());
  cleanup.push(() => stub.close());
  const host = await testHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: () => {} });
  cleanup.push(() => host.close());
  // Counts the opens of the tab's stream, the host's own word on them being the point of the test.
  const realFetch = globalThis.fetch;
  let streamsAsked = 0;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (String(input).includes("/world-api/stream")) streamsAsked += 1;
    return realFetch(input, init);
  }) as typeof fetch;
  cleanup.push(() => {
    globalThis.fetch = realFetch;
  });
  const source = createHostSource({ baseUrl: host.url }, { timings: TIMINGS });
  const connection = source.connection!;
  const states: ConnectionState[] = [];
  // A change of the key's word notifies too: the list holds the changes of the state alone.
  connection.onChange(() => {
    if (states.at(-1) !== connection.state()) states.push(connection.state());
  });
  const stop = source.start(() => {});
  cleanup.push(stop);

  await waitFor("live on the first snapshot", () => connection.state() === "live");
  await waitFor("the host's stream to loops", () => stub.openStreams() === 1);
  // The first ask, then one for each 300 ms of silence: the second and third were answered at once by the host.
  await waitFor("two streams reopened over the silence", () => streamsAsked >= 3);
  assert.deepEqual(states, ["live", "stale"], "Stale stays through two reopened streams the host answered at once");

  stub.heartbeat();
  await waitFor("Live on loops' heartbeat", () => connection.state() === "live");
  assert.deepEqual(states, ["live", "stale", "live"]);
});
