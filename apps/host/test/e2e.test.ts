/**
 * End to end on loopback: the fake crewhub-loops → the host → HostSource → the world-model projection. A ticket
 * move in the fake changes the building's counts within two seconds; a fake restart on the same port recovers
 * without a new source; the key appears in no host response or stream bytes; two sources share one upstream stream.
 * The test pairs first (`mintPairLink()` → the cookie), as a browser would, and hands the cookie to every read.
 * Every server is started by the test on 127.0.0.1 port 0 (the restart reuses the fake's own port).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHostSource } from "@crewhub/loops-client";
import type { ConnectionState, StatusCounts } from "@crewhub/loops-client";
import { createLoopsFake } from "@crewhub/loops-fake";
import { Projection } from "@crewhub/world-model";
import { createHost } from "../src/host.ts";

const SLUG = "crewhub";
const TIMINGS = { staleMs: 1500, teamPollMs: 60_000, retryMinMs: 50, retryMaxMs: 200 };

async function waitFor(what: string, predicate: () => boolean, timeoutMs: number): Promise<number> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return Date.now() - started;
}

/** Opens a one-time link as a browser would and returns the Cookie header to send from then on. */
async function pair(link: string): Promise<string> {
  const response = await fetch(link, { redirect: "manual" });
  assert.equal(response.status, 303);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = /^(crewhub_world_pair=[^;]+)/.exec(setCookie);
  assert.ok(match, `no pairing cookie in ${setCookie}`);
  return match[1] as string;
}

/** Reads the host's stream for `ms` and returns the raw bytes it sent. */
async function streamBytes(url: string, cookie: string, ms: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  let text = "";
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { cookie } });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    // The abort ends the read.
  } finally {
    clearTimeout(timer);
  }
  return text;
}

test("fake → host → HostSource → projection: a move, a fake restart, no key leak, one upstream stream", async () => {
  let fake = await createLoopsFake({ speed: 0, heartbeatMs: 200 });
  const key = fake.key;
  const host = await createHost({
    loopsUrl: fake.url,
    key,
    keyName: fake.keyName,
    retryMs: { min: 50, max: 200 },
    log: () => undefined,
  });
  assert.equal((await fetch(`${host.url}/world-api/snapshot`)).status, 401, "unpaired: no data");
  const cookie = await pair(host.mintPairLink());
  const source = createHostSource({ baseUrl: host.url, timings: TIMINGS, headers: { cookie } });
  const projection = new Projection(source, { coalesceMs: 0 });
  const states: ConnectionState[] = [];
  const connection = source.connection!;
  connection.onChange(() => states.push(connection.state()));
  const stop = source.start((message) => projection.apply(message));
  const counts = (): StatusCounts => projection.facts.projects[SLUG]!.counts;
  try {
    await waitFor("the first snapshot and a live connection", () => projection.facts.loaded && connection.state() === "live", 5000);
    assert.equal(source.mode, "live");
    assert.equal(source.playback, null);

    // 1. A ticket move in the fake reaches the building's counts within 2 s.
    const before = { ...counts() };
    assert.ok(before.in_progress > 0);
    await fake.moveTicket("CR-19", "review");
    const took = await waitFor(
      "the move to reach the counts",
      () => counts().review === before.review + 1 && counts().in_progress === before.in_progress - 1,
      2000,
    );
    assert.ok(took <= 2000, `took ${took} ms`);

    // 2. The key is in no host response and in no stream bytes.
    for (const path of ["/world-api/health", "/world-api/snapshot", `/world-api/board/${SLUG}`, "/world-api/tickets/CR-19", "/world-api/nope"]) {
      const text = await (await fetch(`${host.url}${path}`, { headers: { cookie } })).text();
      assert.ok(!text.includes(key), `${path} leaks the key`);
    }
    const bytes = await streamBytes(`${host.url}/world-api/stream?cursor=0`, cookie, 400);
    assert.ok(bytes.length > 0, "the stream sent something");
    assert.ok(!bytes.includes(key), "the stream leaks the key");

    // 3. Two sources share one upstream loops stream.
    const second = createHostSource({ baseUrl: host.url, timings: TIMINGS, headers: { cookie } });
    const secondProjection = new Projection(second, { coalesceMs: 0 });
    const stopSecond = second.start((message) => secondProjection.apply(message));
    try {
      await waitFor("the second source to go live", () => second.connection!.state() === "live" && secondProjection.facts.loaded, 5000);
      assert.equal(fake.openStreams(), 1, "one loops stream for every tab");
    } finally {
      stopSecond();
      secondProjection.dispose();
    }

    // 4. The fake goes away and comes back on the same port: the connection leaves live and returns without a new source.
    const port = fake.port;
    const lastSeq = fake.lastSeq();
    await fake.close();
    await waitFor("the connection to leave live", () => connection.state() !== "live", 5000);
    assert.ok(states.some((s) => s === "loops-down" || s === "stale"), `saw ${states.join(", ")}`);
    fake = await createLoopsFake({ port, key, keyName: fake.keyName, speed: 0, heartbeatMs: 200, firstSeq: lastSeq });
    await waitFor("the connection to be live again", () => connection.state() === "live", 8000);
    const again = { ...counts() };
    await fake.moveTicket("CR-21", "review");
    await waitFor("a move after the restart to reach the counts", () => counts().review === again.review + 1, 2000);
    assert.equal(projection.facts.invalidEvents, 0);
  } finally {
    stop();
    projection.dispose();
    await host.close();
    await fake.close();
  }
});
