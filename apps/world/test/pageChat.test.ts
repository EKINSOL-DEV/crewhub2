/* Road 2 of the chat in the page (round 28, state/pageChat.ts): the runner asks nothing while the host's key reads the
   chat; otherwise it probes, and where the contract says page it polls at the back-off's pace, hands every agent line to
   the said store and the threads to the card's store, stops on a 401 and probes again, waits offline, slows hidden,
   starts over at the tail when the cursor is gone; stop() ends every step. The fetch, the clock and the timers are
   injected, so a run takes milliseconds. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ChatLine, ChatThreadFact, FetchLike, HostHealth, HostSessionState } from "@crewhub/loops-client";
import { POLL_HIDDEN_MS, POLL_MS, REPROBE_MS } from "@crewhub/loops-client";
import { createPageChatRunner, hostKeyReadsChat, loopsOriginOf, type PageChatState } from "../src/state/pageChat.ts";

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
  const { r, c } = runner({ hostKeyReadsChat: null, fetchFn: l.fetchFn });
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

test("a verdict other than on is asked again every REPROBE_MS; wake() asks at once", async () => {
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
  assert.equal(loopsOriginOf(null), "http://127.0.0.1:8091", "the app's own, as the chat panel's link");
});
