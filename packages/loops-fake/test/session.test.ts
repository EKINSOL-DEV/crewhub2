/**
 * The person's session on the fake (round 12): `POST /api/auth/login` as loops does it (public, no CSRF, 401
 * bad_credentials, the session cookie and the device cookie), a cookie reads the chat (the threads, a thread's messages,
 * one message by id) and every event (an admin), the stream takes `types=dm.*`, the key reads no chat; logout.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createLoopsFake } from "../src/index.ts";

const fakes: { close(): Promise<void> }[] = [];
after(async () => {
  for (const fake of fakes) await fake.close();
});

async function readLines(res: Response, count: number, timeoutMs = 4000): Promise<Record<string, unknown>[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const out: Record<string, unknown>[] = [];
  let pending = "";
  const deadline = Date.now() + timeoutMs;
  while (out.length < count && Date.now() < deadline) {
    const next = await Promise.race([reader.read(), new Promise<{ done: true; value?: undefined }>((r) => setTimeout(() => r({ done: true }), Math.max(1, deadline - Date.now())))]);
    if (next.done) break;
    pending += decoder.decode(next.value, { stream: true });
    let at = pending.indexOf("\n");
    while (at !== -1 && out.length < count) {
      const text = pending.slice(0, at);
      pending = pending.slice(at + 1);
      if (text.trim() !== "") out.push(JSON.parse(text) as Record<string, unknown>);
      at = pending.indexOf("\n");
    }
  }
  await reader.cancel().catch(() => undefined);
  return out;
}

test("login: the demo's person with this run's password gets the session and device cookies; anything else is 401", async () => {
  const fake = await createLoopsFake({ speed: 0 });
  fakes.push(fake);
  const login = (body: unknown) => fetch(`${fake.url}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const wrong = await login({ id: fake.person.id, password: "nope" });
  assert.equal(wrong.status, 401);
  assert.equal(((await wrong.json()) as { error: { code: string } }).error.code, "bad_credentials");
  assert.equal((await fetch(`${fake.url}/api/auth/login`)).status, 405, "GET is not a login");
  const ok = await login({ id: fake.person.id, password: fake.person.password });
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { user: { id: string; kind: string; displayName: string; role: string } };
  assert.deepEqual({ id: body.user.id, kind: body.user.kind, displayName: body.user.displayName, role: body.user.role }, { id: "nicky", kind: "user", displayName: "Nicky", role: "admin" });
  const cookies = ok.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.match(cookies[0] as string, /^chl_session=sess_[0-9a-f]+; HttpOnly; Max-Age=2592000; Path=\/; SameSite=lax$/);
  assert.match(cookies[1] as string, /^chl_device=dev_[0-9a-f]+; HttpOnly; Max-Age=31536000; Path=\/api\/auth; SameSite=lax$/);
  assert.equal(fake.sessionsOpen(), 1);
});

test("a session reads the chat and every event; the key reads no chat; logout ends the session", async () => {
  const fake = await createLoopsFake({ speed: 0, startAt: 300_000 });
  fakes.push(fake);
  const ok = await fetch(`${fake.url}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: fake.person.id, password: fake.person.password }) });
  const cookie = (ok.headers.getSetCookie()[0] as string).split(";")[0] as string;
  const asPerson = (p: string, init: RequestInit = {}) => fetch(`${fake.url}${p}`, { ...init, headers: { cookie, ...(init.headers ?? {}) } });
  const asKey = (p: string) => fetch(`${fake.url}${p}`, { headers: { authorization: `Bearer ${fake.key}` } });
  const threads = (await (await asPerson("/api/dm/threads")).json()) as { threads: { id: string; agentId: string }[] };
  assert.ok(threads.threads.length > 0, "the demo's chats, five minutes into the story");
  const thread = threads.threads[0] as { id: string; agentId: string };
  const messages = (await (await asPerson(`/api/dm/threads/${thread.agentId}/messages`)).json()) as { messages: { id: string; threadId: string; author: { kind: string }; bodyText: string }[] };
  assert.ok(messages.messages.length > 0);
  const one = messages.messages[0] as { id: string };
  const byId = (await (await asPerson(`/api/dm/messages/${one.id}`)).json()) as { message: { id: string; bodyText: string } };
  assert.equal(byId.message.id, one.id);
  assert.equal(typeof byId.message.bodyText, "string");
  assert.equal((await asPerson("/api/dm/messages/dm_nope")).status, 404);
  // The key: no thread of its own, no messages.
  assert.deepEqual(await (await asKey("/api/dm/threads")).json(), { threads: [] });
  assert.equal((await asKey(`/api/dm/threads/${thread.agentId}/messages`)).status, 403);
  assert.equal((await asKey(`/api/dm/messages/${one.id}`)).status, 403);
  // Both at once is ambiguous, as on loops.
  assert.equal((await fetch(`${fake.url}/api/dm/threads`, { headers: { cookie, authorization: `Bearer ${fake.key}` } })).status, 400);
  // The person sees the dm rows the key never does, in the log and on a stream filtered to dm.*.
  const keyLog = (await (await asKey("/api/events?after=0&limit=500")).json()) as { events: { type: string }[] };
  assert.ok(!keyLog.events.some((e) => e.type.startsWith("dm.")), "the key's view has no dm row");
  // (At speed 0 the log holds nothing from before the start; the person's filtered view is proved on the stream below.)
  const personLog = (await (await asPerson("/api/events?after=0&limit=500&types=dm.created")).json()) as { events: { type: string }[] };
  assert.ok(personLog.events.every((e) => e.type === "dm.created"), "a filtered read answers that type only");
  assert.equal((await asPerson("/api/events?after=0&types=dm.nope")).status, 400, "an unknown type is refused");
  // Logout, then the cookie is dead.
  const out = await asPerson("/api/auth/logout", { method: "POST" });
  assert.equal(out.status, 204);
  assert.equal(fake.sessionsOpen(), 0);
  assert.equal((await asPerson("/api/dm/threads")).status, 401);
  assert.equal((await fetch(`${fake.url}/api/auth/logout`, { method: "POST" })).status, 401, "a logout needs a session");
});

test("a person's stream filtered to dm.* gets an agent's answer as it happens, and nothing else", async () => {
  // 4:21 of the story: g-man answers the morning's message (script.ts). Start just before it, at 16x.
  const fake = await createLoopsFake({ speed: 16, startAt: 258_000, heartbeatMs: 200 });
  fakes.push(fake);
  const ok = await fetch(`${fake.url}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: fake.person.id, password: fake.person.password }) });
  const cookie = (ok.headers.getSetCookie()[0] as string).split(";")[0] as string;
  const stream = await fetch(`${fake.url}/api/events/stream?types=dm.created,dm.answered`, { headers: { cookie, accept: "application/x-ndjson" } });
  assert.equal(stream.status, 200);
  const lines = await readLines(stream, 3, 6000);
  const events = lines.filter((l) => l["type"] !== "heartbeat") as { type: string; actor: { id: string; kind: string }; payload: Record<string, unknown> }[];
  const answer = events.find((e) => e.type === "dm.created" && e.actor.kind === "agent");
  assert.ok(answer, `an agent's dm.created on the stream: ${JSON.stringify(events).slice(0, 200)}`);
  assert.equal(answer.actor.id, "g-man");
  assert.deepEqual(Object.keys(answer.payload).sort(), ["agentId", "messageId", "threadId"], "ids only, as loops: the message is read by id");
  assert.ok(events.every((e) => e.type.startsWith("dm.")), "nothing but dm.* on a filtered stream");
  const byId = (await (await fetch(`${fake.url}/api/dm/messages/${answer.payload["messageId"]}`, { headers: { cookie } })).json()) as { message: { bodyText: string; author: { id: string } } };
  assert.equal(byId.message.author.id, "g-man");
  assert.match(byId.message.bodyText, /Busy and calm/);
});
