/* The page's chat stores as one runtime (`state/chatStores.ts`): what each store keeps is in said.test.ts,
   recentAnswers.test.ts, threads.test.ts and soak.test.ts; here what they share: the one subscribe, their independence
   from another instance, the timers, and the road read from the probe beside the health. */
import assert from "node:assert/strict";
import test from "node:test";
import type { HostHealth } from "@crewhub/loops-client";
import { chatRoadReader } from "../src/state/chatRoadStore.ts";
import { SAID_MS } from "../src/state/said.ts";
import { manualChatStores } from "./chatStoresFixture.ts";

const line = (agentId: string, n = 1) => ({ agentId, agentName: agentId, text: `line ${n}`, at: "2026-10-21T19:00:00.000Z", messageId: `dm_${agentId}_${n}`, threadId: `dmt_${agentId}` });

test("one subscribe hears all four stores, until it is taken off", () => {
  const { stores } = manualChatStores();
  let told = 0;
  const off = stores.subscribe(() => (told += 1));
  stores.said.remember(line("boing"));
  assert.equal(told, 1, "a line");
  stores.threads.remember([]);
  assert.equal(told, 2, "the threads");
  stores.probe.remember("on");
  assert.equal(told, 3, "the probe's new verdict");
  stores.page.publish({ polling: true });
  assert.equal(told, 4, "the page chat's state");
  off();
  stores.said.remember(line("boing", 2));
  assert.equal(told, 4, "off: heard no more");
});

test("two runtimes share nothing: a line, a list, a verdict and a state stay in the instance that got them", () => {
  const one = manualChatStores().stores;
  const two = manualChatStores().stores;
  let toldTwo = 0;
  two.subscribe(() => (toldTwo += 1));
  one.said.remember(line("boing"));
  one.threads.remember([{ agentId: "boing", lastMessageAt: "2026-10-22T07:00:00Z", unreadCount: 1 }]);
  one.probe.remember("on");
  one.page.publish({ polls: 3 });
  assert.equal(one.said.count(), 1);
  assert.equal(two.said.count(), 0);
  assert.deepEqual(two.recent(), []);
  assert.equal(two.threads.get(), null);
  assert.equal(two.probe.get(), "unknown");
  assert.equal(two.page.get().polls, 0);
  assert.equal(toldTwo, 0, "nothing heard by the other");
});

test("the bubble's timer: one armed for the next to go, it sweeps and tells, none left when the last has gone", () => {
  const { stores, advance, armed } = manualChatStores(1000);
  let told = 0;
  stores.subscribe(() => (told += 1));
  stores.said.remember(line("boing"));
  assert.equal(armed(), 1);
  advance(1000);
  stores.said.remember(line("g-man"));
  assert.equal(armed(), 1, "still one timer with two bubbles");
  told = 0;
  const before = stores.said.lines();
  advance(SAID_MS - 1000 - 1);
  assert.equal(told, 0, "not yet");
  assert.equal(stores.said.lines(), before, "the same map while nothing changes");
  advance(1);
  assert.equal(told, 1, "the first bubble's end is told");
  assert.deepEqual([...stores.said.lines().keys()], ["g-man"]);
  assert.equal(armed(), 1, "armed for the second");
  advance(1000);
  assert.equal(told, 2);
  assert.equal(stores.said.count(), 0);
  assert.equal(armed(), 0, "nothing left to wait for");
});

test("a newer line of the same agent moves the timer: the older line's end is no news", () => {
  const { stores, at, advance, armed } = manualChatStores(1000);
  stores.said.remember(line("boing"));
  at(1000 + SAID_MS - 1);
  stores.said.remember(line("boing", 2));
  let told = 0;
  stores.subscribe(() => (told += 1));
  advance(1);
  assert.equal(told, 0, "the older line was replaced: its end is no news");
  assert.equal(stores.said.count(), 1);
  assert.equal(armed(), 1);
});

test("a line in flight: a new map when one arrives, so a reader sees the change, and the map a reader holds stays as it was", () => {
  const { stores } = manualChatStores();
  const empty = stores.said.lines();
  stores.said.remember(line("boing"));
  const one = stores.said.lines();
  assert.notEqual(one, empty);
  assert.equal(empty.size, 0);
  stores.said.remember(line("g-man"));
  assert.equal(one.size, 1, "the map handed out earlier did not grow");
  assert.equal(stores.said.lines().size, 2);
});

test("a line whose agent has no name says null, in the bubble and in the list", () => {
  const { stores } = manualChatStores();
  const { agentName: _none, ...nameless } = line("boing");
  stores.said.remember(nameless);
  assert.equal(stores.said.lines().get("boing")?.agentName, null);
  assert.equal(stores.recent()[0]?.agentName, null);
});

test("the probe: the same verdict again tells nobody", () => {
  const { stores } = manualChatStores();
  let told = 0;
  stores.subscribe(() => (told += 1));
  stores.probe.remember("unknown");
  assert.equal(told, 0);
  stores.probe.remember("on");
  stores.probe.remember("on");
  assert.equal(told, 1);
  assert.equal(stores.probe.get(), "on");
});

test("the page chat's state: a part merged over what stands, a new object each time", () => {
  const { stores } = manualChatStores();
  const initial = stores.page.get();
  assert.deepEqual(initial, { probe: "unknown", origin: null, road: "none", polling: false, polls: 0, lines: 0, failure: null, lastPollAt: null });
  stores.page.publish({ polls: 2, road: "page" });
  const next = stores.page.get();
  assert.notEqual(next, initial);
  assert.deepEqual(next, { ...initial, polls: 2, road: "page" });
  stores.page.publish({ lines: 1 });
  assert.deepEqual(stores.page.get(), { ...next, lines: 1 });
});

const keyReadsTheChat = { connection: { session: { state: "key" } } } as unknown as HostHealth;

test("the chat road reader: the health and the probe make one road, the same object while nothing changed, both heard", () => {
  const { stores } = manualChatStores();
  let health: HostHealth | null = null;
  const heard = new Set<() => void>();
  const road = chatRoadReader(stores, { get: () => health, subscribe: (l) => (heard.add(l), () => void heard.delete(l)) }, () => "http://127.0.0.1:5395");

  const none = road.read();
  assert.equal(none.road, "none");
  assert.equal(none.pageOrigin, "http://127.0.0.1:5395");
  assert.equal(road.read(), none, "the same object for an equal road");

  stores.probe.remember("on");
  const page = road.read();
  assert.equal(page.road, "page", "the probe's verdict");
  assert.notEqual(page, none);

  health = keyReadsTheChat;
  assert.equal(road.read().road, "key", "the host's key goes first");

  let told = 0;
  const off = road.subscribe(() => (told += 1));
  assert.equal(heard.size, 1);
  for (const listener of heard) listener();
  stores.probe.remember("chat-off");
  assert.equal(told, 2, "the health and the probe");
  off();
  assert.equal(heard.size, 0);
  stores.probe.remember("on");
  assert.equal(told, 2);
});

test("the chat road reader: a new verdict or origin on the same road is a new object, since the words read them", () => {
  const { stores } = manualChatStores();
  let origin = "http://127.0.0.1:5395";
  const road = chatRoadReader(stores, { get: () => null, subscribe: () => () => {} }, () => origin);
  const first = road.read();
  stores.probe.remember("signed-out");
  const second = road.read();
  assert.equal(second.road, first.road, "still no road");
  assert.notEqual(second, first);
  assert.equal(second.pageProbe, "signed-out");
  origin = "http://127.0.0.1:5396";
  const third = road.read();
  assert.equal(third.road, first.road);
  assert.notEqual(third, second);
  assert.equal(third.pageOrigin, origin);
});
