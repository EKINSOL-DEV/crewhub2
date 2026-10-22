/* Round 27: the long-session probe (state/soak.ts) reads the stores' sizes fresh on every call and keeps nothing; the
   bubbles store counts what is alive and lists each answer once (state/said.ts `saidCount`, `getRecentAnswers`). */
import assert from "node:assert/strict";
import test from "node:test";
import type { ChatLine } from "@crewhub/loops-client";
import { installSoakProbe, worldStores, type ProbeTarget, type StoreReads } from "../src/state/soak.ts";
import { clearSaid, getRecentAnswers, rememberSaid, saidCount, SAID_MS } from "../src/state/said.ts";

const line = (messageId: string, agentId = "a1"): ChatLine => ({ messageId, threadId: "t1", agentId, agentName: "Ann", text: `line ${messageId}`, at: new Date(0).toISOString() }) as ChatLine;

test("worldStores: every size read fresh through the reads, threads null before the first read, nothing kept", () => {
  let said = 1;
  const threads = new Map<string, unknown>([["t1", {}]]);
  const reads: StoreReads = {
    said: () => said,
    answers: () => 2,
    threads: () => threads,
    town: () => ({ docRevision: 7, hostRev: 7 }),
    stream: () => ({ state: "open", reconnects: 3 }),
    connection: () => ({ state: "live" }),
    pageChat: () => ({ probe: "on", road: "page", polling: true, polls: 5, lines: 1 }),
  };
  assert.deepEqual(worldStores(reads), { said: 1, answers: 2, threads: 1, docRevision: 7, hostRev: 7, stream: { state: "open", reconnects: 3 }, connection: { state: "live" }, pageChat: { probe: "on", road: "page", polling: true, polls: 5, lines: 1 } });
  said = 4;
  threads.set("t2", {});
  assert.equal(worldStores(reads).said, 4, "read again, not remembered");
  assert.equal(worldStores(reads).threads, 2);
  assert.equal(worldStores({ ...reads, threads: () => null }).threads, null, "no threads read yet: null, not 0");
  const target: ProbeTarget = {};
  installSoakProbe(reads, target);
  assert.equal(target.__worldStores?.().said, 4, "the probe on the target answers the same reads");
});

test("said: the bubbles alive are counted and swept, the Recent answers list each message once", () => {
  clearSaid();
  assert.equal(saidCount(), 0);
  rememberSaid(line("m1"), 1000);
  rememberSaid(line("m2", "a2"), 1000);
  assert.equal(saidCount(), 2, "two agents' bubbles alive");
  rememberSaid(line("m1"), 1000);
  assert.equal(getRecentAnswers().length, 2, "a replayed message is not listed twice");
  rememberSaid(line("m3"), 1000);
  assert.equal(saidCount(), 2, "the newest replaces the agent's older bubble");
  assert.equal(getRecentAnswers().length, 3);
  rememberSaid(line("m4", "a3"), 1000 + SAID_MS + 1);
  assert.equal(saidCount(), 1, "the earlier bubbles expired by then: swept, one alive");
  clearSaid();
  assert.equal(saidCount(), 0);
  assert.equal(getRecentAnswers().length, 0);
});
