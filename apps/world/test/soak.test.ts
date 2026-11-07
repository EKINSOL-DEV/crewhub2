/* Round 27: the long-session probe (state/soak.ts) reads the stores' sizes fresh on every call and keeps nothing; the
   bubbles store counts what is alive and lists each answer once (state/chatStores.ts `said.count`, `recent`). */
import assert from "node:assert/strict";
import test from "node:test";
import type { ChatLine } from "@crewhub/loops-client";
import { installSoakProbe, worldStores, type ProbeTarget, type StoreReads } from "../src/state/soak.ts";
import { SAID_MS } from "../src/state/said.ts";
import { manualChatStores } from "./chatStoresFixture.ts";

const line = (messageId: string, agentId = "a1"): ChatLine => ({ messageId, threadId: "t1", agentId, agentName: "Ann", text: `line ${messageId}`, at: new Date(0).toISOString() }) as ChatLine;

test("worldStores: every size read fresh through the reads, threads null before the first read, nothing kept", () => {
  let said = 1;
  let faded = 12;
  const threads = new Map<string, unknown>([["t1", {}]]);
  const reads: StoreReads = {
    said: () => said,
    answers: () => 2,
    threads: () => threads,
    town: () => ({ docRevision: 7, hostRev: 7 }),
    stream: () => ({ state: "open", reconnects: 3 }),
    connection: () => ({ state: "live" }),
    pageChat: () => ({ probe: "on", road: "page", polling: true, polls: 5, lines: 1 }),
    faded: () => faded,
  };
  assert.deepEqual(worldStores(reads), { said: 1, answers: 2, threads: 1, docRevision: 7, hostRev: 7, stream: { state: "open", reconnects: 3 }, connection: { state: "live" }, pageChat: { probe: "on", road: "page", polling: true, polls: 5, lines: 1 }, faded: 12 });
  said = 4;
  faded = 0;
  assert.equal(worldStores(reads).faded, 0, "the faded copies read fresh too");
  threads.set("t2", {});
  assert.equal(worldStores(reads).said, 4, "read again, not remembered");
  assert.equal(worldStores(reads).threads, 2);
  assert.equal(worldStores({ ...reads, threads: () => null }).threads, null, "no threads read yet: null, not 0");
  const target: ProbeTarget = {};
  installSoakProbe(reads, target);
  assert.equal(target.__worldStores?.().said, 4, "the probe on the target answers the same reads");
});

test("said: the bubbles alive are counted and swept, the Recent answers list each message once", () => {
  const { stores, at } = manualChatStores(1000);
  assert.equal(stores.said.count(), 0);
  stores.said.remember(line("m1"));
  stores.said.remember(line("m2", "a2"));
  assert.equal(stores.said.count(), 2, "two agents' bubbles alive");
  stores.said.remember(line("m1"));
  assert.equal(stores.recent().length, 2, "a replayed message is not listed twice");
  stores.said.remember(line("m3"));
  assert.equal(stores.said.count(), 2, "the newest replaces the agent's older bubble");
  assert.equal(stores.recent().length, 3);
  at(1000 + SAID_MS + 1);
  stores.said.remember(line("m4", "a3"));
  assert.equal(stores.said.count(), 1, "the earlier bubbles expired by then: swept, one alive");
});
