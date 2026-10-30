/* Road 2 of the chat in the page (round 28, state/pageChat.ts): the runner asks nothing while the host's key reads the
   chat; otherwise it probes, and where the contract says page it polls at the back-off's pace, hands every agent line to
   the said store and the threads to the card's store, stops on a 401 and probes again, waits offline, slows hidden,
   starts over at the tail when the cursor is gone; stop() ends every step. The fetch, the clock and the timers are
   injected, so a run takes milliseconds. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ChatLine, ChatThreadFact, FetchLike, HostHealth, HostSessionState } from "@crewhub/loops-client";
import { POLL_HIDDEN_MS, POLL_MS, REPROBE_MS, REPROBE_SLOW_MS } from "@crewhub/loops-client";
import { createPageChatRunner, healthRereadKey, hostKeyReadsChat, loopsOriginOf, type PageChatState } from "../src/state/pageChat.ts";

const ORIGIN = "http://127.0.0.1:8293";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Timers the test fires by hand, in order of their due time. */
function clock() {
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
    /** Fires the earliest timer and moves the clock to it. */
    async tick() {
      if (due.length === 0) return;
      due.sort((a, b) => a.at - b.at);
      const first = due.shift()!;
      now = first.at;
      first.fn();
      await settle();
    },
  };
}
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

function loops(options: { signedIn?: boolean; events?: () => unknown[]; cursorGone?: boolean } = {}) {
  const calls: string[] = [];
  let cursorGone = options.cursorGone ?? false;
  let signedIn = options.signedIn ?? true;
  const fetchFn: FetchLike = async (url) => {
    const path = url.replace(ORIGIN, "");
    calls.push(path);
    if (!signedIn) return json(401, { error: { code: "unauthenticated" } });
    if (path.startsWith("/api/dm/threads")) return json(200, { threads: [{ agentId: "crewhub-lead", lastMessageAt: "2026-10-22T20:00:00Z", unreadCount: calls.length }] });
    if (path.startsWith("/api/events")) {
      if (cursorGone) {
        cursorGone = false;
        return json(410, { error: { code: "cursor_expired" } });
      }
      return json(200, { events: options.events?.() ?? [], lastSeq: 1, cursor: `c.${calls.length}` });
    }
    if (path.startsWith("/api/dm/messages/")) return json(200, { message: { bodyText: `Answer ${path.slice(-2)}`, createdAt: "2026-10-22T21:05:00Z", author: { kind: "agent", displayName: "crewhub-lead" } } });
    return json(404, {});
  };
  return { calls, fetchFn, signOut: () => (signedIn = false), signIn: () => (signedIn = true) };
}
const agentDm = (id: string) => ({ seq: 1, type: "dm.created", actor: { id: "crewhub-lead", kind: "agent" }, payload: { threadId: "t1", messageId: id, agentId: "crewhub-lead" } });

function runner(input: { hostKeyReadsChat: boolean | null; fetchFn: FetchLike; hidden?: () => boolean; online?: () => boolean }) {
  const c = clock();
  const lines: ChatLine[] = [];
  const threads: ChatThreadFact[][] = [];
  const states: PageChatState[] = [];
  const r = createPageChatRunner({ loopsOrigin: ORIGIN, hostKeyReadsChat: input.hostKeyReadsChat, fetch: input.fetchFn, now: c.now, schedule: c.schedule, hidden: input.hidden ?? (() => false), online: input.online ?? (() => true), onLine: (l) => lines.push(l), onThreads: (t) => threads.push(t), onState: (s) => states.push(s) });
  return { r, c, lines, threads, states };
}

test("the key road: the host's key reads the chat, so the page asks loops nothing, ever", async () => {
  const l = loops();
  const { r, c } = runner({ hostKeyReadsChat: true, fetchFn: l.fetchFn });
  r.start();
  await settle();
  assert.deepEqual(l.calls, []);
  assert.equal(c.pending(), null, "no timer either");
  assert.equal(r.state().road, "key");
  assert.equal(r.state().probe, "unknown");
  r.wake();
  await settle();
  assert.deepEqual(l.calls, []);
});

test("the page road: the probe (the threads, to the card's store), then the poll from the tail every 5 s; an agent's line goes to the said store, the threads again after a dm event", async () => {
  let events: unknown[] = [];
  const l = loops({ events: () => events });
  const { r, c, lines, threads } = runner({ hostKeyReadsChat: false, fetchFn: l.fetchFn });
  r.start();
  await settle();
  assert.equal(r.state().probe, "on");
  assert.equal(r.state().road, "page");
  assert.equal(r.state().polling, true);
  assert.equal(threads.length, 1, "the probe's threads reach the card's store at once");
  assert.deepEqual(l.calls.slice(0, 2), ["/api/dm/threads", "/api/events?types=dm.created%2Cdm.answered&limit=50&from=tail"], "the probe, then the first poll from the tail (nothing from before the page opened)");
  assert.equal(c.pending(), POLL_MS, "the next poll in 5 s");
  events = [agentDm("m1")];
  await c.tick();
  assert.deepEqual(lines.map((x) => [x.agentId, x.text, x.messageId]), [["crewhub-lead", "Answer m1", "m1"]]);
  assert.equal(threads.length, 2, "a dm event: the threads read again");
  assert.ok(l.calls.at(-1)!.startsWith("/api/dm/threads"));
  assert.ok(l.calls.some((p) => p.includes("cursor=c.")), "the sealed cursor sent back");
  assert.equal(r.state().lines, 1);
  assert.equal(r.state().polls, 2);
  assert.equal(r.state().lastPollAt, c.now());
  events = [];
  await c.tick();
  assert.equal(lines.length, 1, "nothing new: no line, no threads read");
  assert.equal(threads.length, 2);
  assert.equal(l.calls.every((p) => p.startsWith("/api/events") || p.startsWith("/api/dm/threads") || p.startsWith("/api/dm/messages/")), true, "the four routes only");
  r.stop();
  assert.equal(c.pending(), null, "stop cancels the next poll");
  assert.equal(r.state().polling, false);
});

test("a 401 while polling: the road is off, the poll stops, the probe asks again after REPROBE_MS; a sign-in brings it back by itself", async () => {
  const l = loops();
  const { r, c } = runner({ hostKeyReadsChat: false, fetchFn: l.fetchFn });
  r.start();
  await settle();
  assert.equal(r.state().road, "page");
  l.signOut();
  await c.tick();
  assert.equal(r.state().probe, "signed-out");
  assert.equal(r.state().road, "none");
  assert.equal(r.state().polling, false);
  assert.equal(c.pending(), REPROBE_MS);
  const before = l.calls.length;
  await c.tick();
  assert.equal(l.calls.length, before + 1, "one probe, no poll while signed out");
  assert.equal(r.state().probe, "signed-out");
  l.signIn();
  await c.tick();
  assert.equal(r.state().road, "page", "signed in again (another tab): the probe found the road and the poll runs");
  assert.equal(r.state().polling, true);
  assert.equal(c.pending(), POLL_MS);
  r.stop();
});

test("a verdict other than on is asked again: signed out every REPROBE_MS, a refused origin every REPROBE_SLOW_MS (each ask is a CORS line in the console), nothing answering with a back-off from the poll's pace to REPROBE_SLOW_MS (round 29, Low 9); wake() asks at once", async () => {
  const l = loops({ signedIn: false });
  const { r, c } = runner({ hostKeyReadsChat: false, fetchFn: l.fetchFn });
  r.start();
  await settle();
  assert.equal(r.state().probe, "signed-out");
  assert.equal(c.pending(), REPROBE_MS);
  r.wake();
  await settle();
  assert.equal(l.calls.length, 2, "wake probed now");
  r.stop();
  const refused = runner({ hostKeyReadsChat: false, fetchFn: async (_url, init) => (init?.mode === "no-cors" ? Response.error() : Promise.reject(new TypeError("Failed to fetch"))) });
  refused.r.start();
  await settle();
  assert.equal(refused.r.state().probe, "origin-not-set");
  assert.equal(refused.c.pending(), REPROBE_SLOW_MS, "a refused origin: asked again in 5 min, not 30 s");
  assert.equal(REPROBE_SLOW_MS, 300_000);
  refused.r.stop();
  const gone = runner({ hostKeyReadsChat: false, fetchFn: async () => Promise.reject(new TypeError("Failed to fetch")) });
  gone.r.start();
  await settle();
  assert.equal(gone.r.state().probe, "unreachable");
  assert.equal(gone.c.pending(), POLL_MS, "nothing answered once: asked again in 5 s, not 5 min (a loops restarting is the common case)");
  await gone.c.tick();
  assert.equal(gone.c.pending(), 2 * POLL_MS);
  await gone.c.tick();
  assert.equal(gone.c.pending(), 4 * POLL_MS);
  for (let i = 0; i < 8; i++) await gone.c.tick();
  assert.equal(gone.c.pending(), REPROBE_SLOW_MS, "capped at five minutes");
  gone.r.stop();
});

test("hidden: the poll slows to a minute; offline: nothing is scheduled until wake() (the online event); a gone cursor starts again at the tail", async () => {
  let hidden = false;
  let online = true;
  const l = loops({ cursorGone: false });
  const { r, c } = runner({ hostKeyReadsChat: false, fetchFn: l.fetchFn, hidden: () => hidden, online: () => online });
  r.start();
  await settle();
  hidden = true;
  await c.tick();
  assert.equal(c.pending(), POLL_HIDDEN_MS);
  hidden = false;
  online = false;
  await c.tick();
  assert.equal(c.pending(), null, "offline: no poll scheduled");
  assert.equal(r.state().polling, true, "the road stays on; it waits for the online event");
  online = true;
  const before = l.calls.length;
  r.wake();
  await settle();
  assert.equal(l.calls.length, before + 1, "online again: one poll now");
  assert.equal(c.pending(), POLL_MS);
  r.stop();
  const gone = loops({ cursorGone: true });
  const second = runner({ hostKeyReadsChat: false, fetchFn: gone.fetchFn });
  second.r.start();
  await settle();
  const polls = gone.calls.filter((p) => p.startsWith("/api/events"));
  assert.ok(polls[0]!.includes("from=tail"));
  await second.c.tick();
  const again = gone.calls.filter((p) => p.startsWith("/api/events"));
  assert.equal(again.length, 2);
  assert.ok(again[1]!.includes("from=tail"), "the cursor was refused (410): the next poll starts at the tail again");
  second.r.stop();
});

test("a failure backs off (10 s, 20 s, …) and the state says why; the next answer resets the pace", async () => {
  let fail = true;
  const fetchFn: FetchLike = async (url) => {
    if (url.includes("/api/dm/threads")) return json(200, { threads: [] });
    if (fail) throw new TypeError("Failed to fetch");
    return json(200, { events: [], lastSeq: 0, cursor: "c.1" });
  };
  const { r, c } = runner({ hostKeyReadsChat: false, fetchFn });
  r.start();
  await settle();
  assert.equal(r.state().failure, "Failed to fetch");
  assert.equal(c.pending(), 2 * POLL_MS);
  await c.tick();
  assert.equal(c.pending(), 4 * POLL_MS);
  fail = false;
  await c.tick();
  assert.equal(r.state().failure, null);
  assert.equal(c.pending(), POLL_MS);
  r.stop();
});

test("the host's word and the origin: the key's state in health, the loops web origin (the API is on it)", () => {
  const health = (session: HostSessionState | undefined, loopsWebUrl?: string): HostHealth =>
    ({ loops: "ok", keyName: "k", sharedKey: false, ...(loopsWebUrl ? { loopsWebUrl } : {}), connection: { discovery: { state: "found" }, key: { state: "ok" }, stream: { state: "ok", reconnects: 0 }, ...(session ? { session } : {}) } }) as HostHealth;
  assert.equal(hostKeyReadsChat(health({ state: "key" })), true);
  assert.equal(hostKeyReadsChat(health(undefined)), false, "a host whose connection names no session: its key does not read the chat (as state/chatRoadStore reads it)");
  assert.equal(hostKeyReadsChat(null), null);
  assert.equal(loopsOriginOf(health(undefined, "http://127.0.0.1:8293/")), "http://127.0.0.1:8293");
  assert.equal(loopsOriginOf(health(undefined, "http://127.0.0.1:8293/some/path")), "http://127.0.0.1:8293", "the origin only");
  assert.equal(loopsOriginOf(null), null, "no loops web origin named: no runner (round 29, Low 7); the Chat panel's link alone falls back to the app's own");
  assert.equal(loopsOriginOf(health(undefined)), null);
  assert.equal(hostKeyReadsChat(health({ state: "unknown" })), null, "the host has not said yet (round 29)");
});

test("round 29 (Medium 2, the page's half): while the host has not said whether its key reads the chat, the runner asks loops nothing and the road is none; a health re-read is due when the stream goes live or the key word changes", async () => {
  const l = loops();
  const { r, c } = runner({ hostKeyReadsChat: null, fetchFn: l.fetchFn });
  r.start();
  await settle();
  assert.deepEqual(l.calls, [], "no probe on a guess");
  assert.equal(c.pending(), null);
  assert.equal(r.state().road, "none");
  assert.equal(r.state().probe, "unknown");
  r.wake();
  await settle();
  assert.deepEqual(l.calls, []);
  r.stop();
  assert.equal(healthRereadKey(null, null), null, "nothing known: the gate's read stands");
  assert.equal(healthRereadKey("loops-down", null), null);
  assert.notEqual(healthRereadKey("live", null), null, "the stream live: read again");
  assert.notEqual(healthRereadKey("live", "ok"), healthRereadKey("live", null), "the key word: read again");
  assert.notEqual(healthRereadKey("live", "ok"), healthRereadKey("stale", "ok"), "live again after stale: read again");
});

test("round 29 (Low 8): a loops elsewhere than this computer is not asked: the verdict is remote, the road none", async () => {
  const l = loops();
  const c = clock();
  const r = createPageChatRunner({ loopsOrigin: "https://crewhub.example", hostKeyReadsChat: false, fetch: l.fetchFn, now: c.now, schedule: c.schedule });
  r.start();
  await settle();
  assert.deepEqual(l.calls, []);
  assert.equal(r.state().probe, "remote");
  assert.equal(r.state().road, "none");
  assert.equal(c.pending(), null);
  r.wake();
  await settle();
  assert.deepEqual(l.calls, []);
  r.stop();
});

test("round 29 (Low 5, the reviewer's proof 3): wake() while a poll's timer pends and loops answers slowly: one poll in flight, the line handed over once", async () => {
  const c = clock();
  const calls: string[] = [];
  const lines: ChatLine[] = [];
  const gate: (() => void)[] = [];
  let events: unknown[] = [];
  const fetchFn: FetchLike = async (url) => {
    const path = url.replace(ORIGIN, "");
    calls.push(path);
    if (path.startsWith("/api/dm/threads")) return json(200, { threads: [] });
    if (path.startsWith("/api/events")) {
      await new Promise<void>((resolve) => gate.push(resolve));
      return json(200, { events, lastSeq: 2, cursor: `c.${calls.filter((p) => p.startsWith("/api/events")).length}` });
    }
    if (path.startsWith("/api/dm/messages/")) return json(200, { message: { bodyText: "Answer m1", createdAt: "2026-10-22T21:05:00Z", author: { kind: "agent", displayName: "crewhub-lead" } } });
    return json(404, {});
  };
  const r = createPageChatRunner({ loopsOrigin: ORIGIN, hostKeyReadsChat: false, fetch: fetchFn, now: c.now, schedule: c.schedule, onLine: (l) => lines.push(l) });
  r.start();
  await settle();
  gate.shift()!();
  await settle();
  assert.equal(r.state().road, "page");
  assert.equal(c.pending(), POLL_MS);
  events = [agentDm("m1")];
  r.wake();
  await settle();
  assert.equal(c.pending(), null, "wake dropped the pending timer");
  await c.tick();
  await settle();
  assert.equal(gate.length, 1, "one events poll in flight");
  while (gate.length > 0) gate.shift()!();
  await settle();
  await settle();
  assert.equal(lines.length, 1, "the line once");
  assert.equal(c.pending(), POLL_MS, "the next poll set after the one in flight");
  r.stop();
});

test("round 29 (Medium 3): loops' chat bubbles switched off while polling (a 409 on a message read) turns the road off and the probe asks again after REPROBE_MS; switched on again, the road comes back", async () => {
  let off = true;
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url) => {
    const path = url.replace(ORIGIN, "");
    calls.push(path);
    if (path.startsWith("/api/dm/threads")) return off && calls.length > 1 ? json(409, { error: { code: "feature_off" } }) : json(200, { threads: [] });
    if (path.startsWith("/api/events")) return json(200, { events: [agentDm("m1")], lastSeq: 2, cursor: "c.2" });
    if (path.startsWith("/api/dm/messages/")) return off ? json(409, { error: { code: "feature_off", message: "The chat bubbles feature is off" } }) : json(200, { message: { bodyText: "Answer", createdAt: "2026-10-22T21:05:00Z", author: { kind: "agent" } } });
    return json(404, {});
  };
  const { r, c, lines } = runner({ hostKeyReadsChat: false, fetchFn });
  r.start();
  await settle();
  assert.equal(r.state().probe, "chat-off");
  assert.equal(r.state().road, "none");
  assert.equal(r.state().polling, false);
  assert.equal(lines.length, 0);
  assert.equal(c.pending(), REPROBE_MS, "readable, no console line: asked again in 30 s");
  off = false;
  await c.tick();
  assert.equal(r.state().road, "page", "switched on: the road is back");
  r.stop();
});

test("round 29 (Low 9): the probe is not made while offline; once online, a start asks", async () => {
  let online = false;
  const l = loops();
  const { r, c } = runner({ hostKeyReadsChat: false, fetchFn: l.fetchFn, online: () => online });
  r.start();
  await settle();
  assert.deepEqual(l.calls, [], "offline: nothing asked");
  assert.equal(c.pending(), null);
  r.stop();
  online = true;
  const again = runner({ hostKeyReadsChat: false, fetchFn: l.fetchFn, online: () => online });
  again.r.start();
  await settle();
  assert.equal(again.r.state().road, "page");
  again.r.stop();
});

test("round 48 (r48-live): offline when the page opens, the online event's wake() makes the probe the start could not (the page's wiring wakes, it does not restart)", async () => {
  let online = false;
  const l = loops();
  const { r } = runner({ hostKeyReadsChat: false, fetchFn: l.fetchFn, online: () => online });
  r.start();
  await settle();
  assert.deepEqual(l.calls, [], "offline: nothing asked");
  online = true;
  r.wake();
  await settle();
  assert.equal(l.calls[0], "/api/dm/threads", "online again: the probe asks");
  assert.equal(r.state().road, "page");
  r.stop();
});
