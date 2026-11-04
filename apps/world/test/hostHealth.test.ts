/* The host's health in the page, one module (round 59d, C6): every read of the host's health goes through
   `createHostHealth`, driven here with a fake probe and a fake clock, through its interface only (`need`, `stream`, `ask`,
   `view`, and the derivations `screenOver` and `snapshotProgress`). The facts: a need asks at once and polls at its pace,
   the fastest held need sets one pace, one read is in flight at a time, a silence keeps the last answer, the stream's
   word reads again when it changes (the chat road's re-read, which `healthRereadKey` in state/pageChat.ts decided before)
   and polls a host that leaves the key unsaid, and a Forget in another tab leads to the Connect screen. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ConnectionState, HostConnection, HostHealth, HostSnapshotState } from "@crewhub/loops-client";
import { createHostHealth, HEALTH_POLL_MS, screenOver, snapshotProgress, type HostHealthModule, type StreamWord } from "../src/state/health.ts";

const connection = (over: { key?: Partial<HostConnection["key"]>; stream?: Partial<HostConnection["stream"]>; snapshot?: HostSnapshotState } = {}): HostConnection => ({
  discovery: { state: "found", via: "app-port", target: "http://127.0.0.1:1" },
  key: { state: "ok", name: "crewhub-world", source: "stored", ...over.key },
  stream: { state: "ok", cursor: 12, reconnects: 0, ...over.stream },
  ...(over.snapshot ? { snapshot: over.snapshot } : {}),
});
const health = (over: Partial<HostHealth> = {}): HostHealth => ({ loops: "ok", keyName: "crewhub-world", sharedKey: false, pairing: "on", paired: true, connection: connection(), ...over });
const word = (state: ConnectionState | null, key: StreamWord["key"] = null): StreamWord => ({ connection: state, key });

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 2));

/** A host whose answer the test sets; with `hold`, each read waits for `flush()`. Counts reads and the most at once. */
function fakeHost(first: HostHealth | null = health()) {
  let answer: HostHealth | null = first;
  let inFlight = 0;
  const waiting: (() => void)[] = [];
  const host = {
    calls: 0,
    most: 0,
    hold: false,
    set: (next: HostHealth | null) => {
      answer = next;
    },
    probe: async (): Promise<HostHealth | null> => {
      host.calls += 1;
      inFlight += 1;
      host.most = Math.max(host.most, inFlight);
      if (host.hold) await new Promise<void>((resolve) => waiting.push(resolve));
      inFlight -= 1;
      return answer;
    },
    /** Lets every waiting read answer. */
    flush: async () => {
      for (const resolve of waiting.splice(0)) resolve();
      await settle();
    },
  };
  return host;
}

function fakeClock() {
  let now = 1_000_000;
  const due: { at: number; fn: () => void; id: number }[] = [];
  let next = 0;
  return {
    now: () => now,
    schedule: (fn: () => void, ms: number) => {
      const id = next++;
      due.push({ at: now + ms, fn, id });
      return () => {
        const i = due.findIndex((d) => d.id === id);
        if (i !== -1) due.splice(i, 1);
      };
    },
    /** The next timer's wait (ms), or null. */
    pending: () => (due.length === 0 ? null : Math.min(...due.map((d) => d.at)) - now),
    /** Moves the clock by `ms`, firing every timer due on the way, in order. */
    advance: async (ms: number) => {
      const end = now + ms;
      for (;;) {
        due.sort((a, b) => a.at - b.at || a.id - b.id);
        const first = due[0];
        if (first === undefined || first.at > end) break;
        due.shift();
        now = first.at;
        first.fn();
        await settle();
      }
      now = end;
    },
  };
}

function setup(initial: HostHealth | null = health(), first: HostHealth | null = initial) {
  const host = fakeHost(first);
  const clock = fakeClock();
  const module: HostHealthModule = createHostHealth({ probe: host.probe, initial, now: clock.now, schedule: clock.schedule });
  return { host, clock, module };
}

test("a need asks at once and then at its pace; released, the host is not asked again", async () => {
  const { host, clock, module } = setup();
  const release = module.need("screen");
  await settle();
  assert.equal(host.calls, 1, "at once");
  assert.equal(clock.pending(), HEALTH_POLL_MS.screen);
  await clock.advance(2500);
  assert.equal(host.calls, 2);
  await clock.advance(2500);
  assert.equal(host.calls, 3);
  release();
  release();
  assert.equal(clock.pending(), null, "no need held: no timer");
  await clock.advance(20_000);
  assert.equal(host.calls, 3);
  module.dispose();
});

test("the fastest held need sets the one pace; releasing it falls back to the next", async () => {
  const { host, clock, module } = setup();
  const panel = module.need("panel");
  assert.equal(clock.pending(), 5000);
  const snapshot = module.need("snapshot");
  assert.equal(clock.pending(), 500, "the first snapshot loading: every 0.5 s");
  await settle();
  await clock.advance(1000);
  assert.equal(host.calls, 2 + 2, "two at once (one after the other), then two at 0.5 s");
  snapshot();
  assert.equal(clock.pending(), 5000, "the panel's pace again");
  const screen = module.need("screen");
  assert.equal(clock.pending(), 2500);
  screen();
  panel();
  assert.equal(clock.pending(), null);
  assert.equal(host.most, 1);
  module.dispose();
});

test("a new pace counts from the last read, not from the change: the panel's next read is 5 s after the last one when the first snapshot's need ends (review-c6, 1)", async () => {
  const { host, clock, module } = setup();
  const panel = module.need("panel");
  const snapshot = module.need("snapshot");
  await settle();
  await clock.advance(1000);
  const reads = host.calls;
  await clock.advance(300);
  snapshot();
  assert.equal(clock.pending(), 5000 - 300, "5 s after the read at 1 s, not 5 s after the release");
  await clock.advance(4700);
  assert.equal(host.calls, reads + 1);
  assert.equal(clock.pending(), 5000, "then the panel's own pace");
  panel();
  module.dispose();
});

test("a glance asks once and never polls", async () => {
  const { host, clock, module } = setup();
  const release = module.need("glance");
  await settle();
  assert.equal(host.calls, 1);
  assert.equal(clock.pending(), null);
  release();
  module.dispose();
});

test("one read in flight: asks during it make one more read after it, never two at once", async () => {
  const { host, module } = setup();
  host.hold = true;
  module.need("glance");
  module.ask();
  module.ask();
  module.need("glance");
  await settle();
  assert.equal(host.calls, 1, "the asks wait for the read in flight");
  host.set(health({ keyName: "second" }));
  await host.flush();
  assert.equal(host.calls, 2, "one more read after it");
  await host.flush();
  assert.equal(host.calls, 2, "and only one");
  assert.equal(host.most, 1);
  assert.equal(module.view().health?.keyName, "second");
  module.dispose();
});

test("a silent host keeps the health it last answered; the read says it went unanswered and the snapshot progress is null", async () => {
  const gate = health({ connection: connection({ snapshot: { state: "idle" } }) });
  const { host, module } = setup(gate, null);
  assert.equal(module.view().read, null, "no read yet");
  assert.equal(snapshotProgress(module.view().read), null, "no read yet: no progress, not the gate's");
  module.ask();
  await settle();
  assert.equal(module.view().health, gate, "a silence never replaces the answer");
  assert.equal(module.view().read?.health, null);
  assert.equal(snapshotProgress(module.view().read), null);
  const reading: HostSnapshotState = { state: "reading", reads: 3, projects: 12 };
  host.set(health({ connection: connection({ snapshot: reading }) }));
  module.ask();
  await settle();
  assert.deepEqual(snapshotProgress(module.view().read), reading);
  assert.equal(module.view().read?.seq, 2);
  module.dispose();
});

test("an answer equal to the health kept keeps the same object, so the page's readers do not render for it", async () => {
  const gate = health();
  const { module } = setup(gate, health());
  let told = 0;
  module.subscribe(() => (told += 1));
  module.ask();
  await settle();
  assert.equal(module.view().health, gate);
  assert.equal(told, 1, "the read itself is still told (the panel's Updated line)");
  module.dispose();
});

test("the stream's word reads again when the stream goes live, when the key word changes, and when live comes back after stale; not while nothing is known", async () => {
  const { host, clock, module } = setup();
  module.stream(word("connecting"));
  module.stream(word("stale"));
  await settle();
  assert.equal(host.calls, 0, "nothing known: the gate's read stands");
  module.stream(word("live"));
  await settle();
  assert.equal(host.calls, 1, "the stream live: read again");
  module.stream(word("live"));
  await settle();
  assert.equal(host.calls, 1, "the same word: no read");
  module.stream(word("live", "ok"));
  await settle();
  assert.equal(host.calls, 2, "the key word: read again");
  module.stream(word("stale", "ok"));
  await settle();
  assert.equal(host.calls, 3, "off live with a key word: read again");
  module.stream(word("live", "ok"));
  await settle();
  assert.equal(host.calls, 4, "live again after stale: read again");
  assert.equal(clock.pending(), null, "a re-read is one read, not a poll");
  module.stream(null);
  module.stream(word("live", "ok"));
  await settle();
  assert.equal(host.calls, 5, "a page that leaves and comes back reads again");
  module.dispose();
});

test("a Forget in another tab leads to the Connect screen: at once from the stream's key word, by a poll from a host that leaves it unsaid", async () => {
  // The stream says the host's key word (round 11 on): the screen follows it before any read.
  const { module } = setup();
  module.stream(word("live", "ok"));
  await settle();
  assert.equal(screenOver(module.view().health, word("live", "ok")), null, "the town");
  assert.equal(screenOver(module.view().health, word("unauthorized", "none")), "connect");
  assert.equal(screenOver(module.view().health, word("loops-down", "none")), "connect", "the reconnected stream's 503 no_key");
  assert.equal(screenOver(module.view().health, word("unauthorized", "checking")), "checking", "a key pasted elsewhere");
  assert.equal(screenOver(module.view().health, word("unauthorized", "rejected")), "rejected", "the key revoked while Live");
  assert.equal(screenOver(module.view().health, word("unpaired")), "pair");
  module.dispose();
  // A host from before round 11 says no key word: the health still says ok, so no screen yet; the module polls at a
  // screen's pace until the host's answer says the key is gone, then stops (the Connect screen's own need takes over).
  const old = setup();
  old.module.stream(word("live"));
  await settle();
  assert.equal(old.host.calls, 1);
  old.module.stream(word("unauthorized"));
  await settle();
  assert.equal(screenOver(old.module.view().health, word("unauthorized")), null, "the key ok in the last read: the chip's story");
  assert.equal(old.host.calls, 2, "the degraded poll asks at once");
  assert.equal(old.clock.pending(), HEALTH_POLL_MS.screen);
  await old.clock.advance(2500);
  assert.equal(old.host.calls, 3);
  old.host.set(health({ loops: "unauthorized", connection: { ...connection(), key: { state: "none" } } }));
  await old.clock.advance(2500);
  assert.equal(old.host.calls, 4);
  assert.equal(screenOver(old.module.view().health, word("unauthorized")), "connect", "the Connect screen");
  assert.equal(old.clock.pending(), null, "the degraded poll stops once a screen shows");
  const screen = old.module.need("screen");
  assert.equal(old.clock.pending(), HEALTH_POLL_MS.screen, "the screen polls");
  screen();
  old.module.dispose();
});

test("a page forced live with a silent host: no health known reads as a host without a connection", () => {
  assert.equal(screenOver(null, word("unauthorized", "none")), "connect", "the stream's key word still decides");
  assert.equal(screenOver(null, word("unauthorized")), "rejected", "a host from before: unauthorized is rejected");
  assert.equal(screenOver(null, word("loops-down")), null);
  assert.equal(screenOver(null, word("live", "ok")), null);
});

test("the Connection panel's need asks at once when the stream's state changes; without it a change of state alone asks nothing", async () => {
  const { host, module } = setup();
  module.stream(word("connecting"));
  module.stream(word("stale"));
  module.stream(word("catching-up"));
  await settle();
  assert.equal(host.calls, 0);
  const panel = module.need("panel");
  await settle();
  assert.equal(host.calls, 1, "the panel asks when it opens");
  module.stream(word("stale"));
  await settle();
  assert.equal(host.calls, 2, "a change of state asks at once");
  module.stream(word("stale"));
  await settle();
  assert.equal(host.calls, 2, "the same state: no read");
  panel();
  module.stream(word("catching-up"));
  await settle();
  assert.equal(host.calls, 2);
  module.dispose();
});

test("disposed, the module asks nothing more and drops a read in flight", async () => {
  const { host, clock, module } = setup(health(), health({ keyName: "late" }));
  host.hold = true;
  module.need("snapshot");
  module.dispose();
  await host.flush();
  assert.equal(module.view().health?.keyName, "crewhub-world", "the answer in flight is dropped");
  assert.equal(clock.pending(), null);
  module.ask();
  module.need("screen");
  await settle();
  assert.equal(host.calls, 1);
});

test("stream words of any value never throw and ask at most once per change (round 34's fuzz of the re-read key, through the module)", async () => {
  const { host, module } = setup();
  let words = 0;
  for (const a of [null, "live", "down", "", "x", 1 as unknown as string]) {
    for (const b of [null, "ok", "rejected", "", "\0"]) {
      module.stream({ connection: a, key: b } as unknown as StreamWord);
      words += 1;
      await settle();
    }
  }
  assert.ok(host.calls <= words, `${host.calls} reads for ${words} words`);
  assert.ok(host.most <= 1);
  module.dispose();
});

// The port of task/r27-tab-pairing onto C6: the page's probe asks the other tabs for a pairing only while a Connect
// screen shows (r27's ConnectPage asked them before each of its reads); the module tells its probe which needs it holds.
test("the probe hears which needs are held at each read: a Connect screen's reads say screen, a panel's alone do not", async () => {
  const clock = fakeClock();
  const seen: boolean[] = [];
  const module = createHostHealth({
    probe: async (needs) => {
      seen.push(needs.holds("screen"));
      return health();
    },
    initial: health(),
    now: clock.now,
    schedule: clock.schedule,
  });
  const panel = module.need("panel");
  await settle();
  assert.deepEqual(seen, [false], "a panel's read: no screen");
  const screen = module.need("screen");
  await settle();
  assert.deepEqual(seen, [false, true], "the Connect screen's read says so");
  screen();
  module.ask();
  await settle();
  assert.deepEqual(seen, [false, true, false], "released: the next read does not");
  panel();
  module.dispose();
});
