/**
 * The person's chat session (round 12, road B option 2): the host signs in as the person over loopback, keeps only the
 * session cookie (0600, beside the key), reads the chat with it (an allow-list: the threads, the messages, the dm.*
 * stream; nothing else, ever), turns an agent's message into a `chat` line for the tabs, says its states honestly
 * (signed in as, expired, signed out) and forgets on DELETE. The password is in the sign-in request to loops and
 * nowhere else: no file, no log line, no health, no other request. Everything against the stub on 127.0.0.1.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { SESSION_ROUTES, allowedSessionPath, createSessionStore, sessionCookieOf } from "../src/session.ts";
import { type LoopsStub, createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { waitFor } from "./wait.ts";

const PERSON = { id: "nicky", password: "correct horse battery staple", displayName: "Nicky" };
const AGENT_MESSAGE = { id: "dm_a1", threadId: "dmt_boing", agentId: "boing", author: { id: "boing", kind: "agent", displayName: "Boing" }, bodyText: "On it. The nook is done,\nthe lamp is next.", bodyMarkdown: "On it.", createdAt: "2026-10-21T19:00:00.000Z" };
const PERSON_MESSAGE = { id: "dm_p1", threadId: "dmt_boing", agentId: "boing", author: { id: "nicky", kind: "user", displayName: "Nicky" }, bodyText: "How is the nook?", bodyMarkdown: "How is the nook?", createdAt: "2026-10-21T18:59:00.000Z" };

describe("the session's allow-list", () => {
  it("names exactly the sign-in, the sign-out and the chat's reads; everything else is refused before anything is sent", () => {
    assert.deepEqual(
      SESSION_ROUTES.map((r) => `${r.method} ${r.pattern}`),
      ["POST /api/auth/login", "POST /api/auth/logout", "GET /api/dm/threads", "GET /api/dm/threads/{agent}/messages", "GET /api/dm/messages/{id}", "GET /api/events", "GET /api/events/stream"],
    );
    assert.equal(allowedSessionPath("GET", "/api/dm/threads", {}), "/api/dm/threads");
    assert.equal(allowedSessionPath("GET", "/api/dm/messages/dm_1", {}), "/api/dm/messages/dm_1");
    assert.equal(allowedSessionPath("GET", "/api/events/stream", { types: "dm.created,dm.answered", after: "5", limit: "9" }), "/api/events/stream?after=5&types=dm.created%2Cdm.answered");
    for (const [method, p, query] of [
      ["POST", "/api/dm/threads/boing/messages", {}], // a send
      ["PUT", "/api/dm/threads/boing/read", {}], // a mark-read
      ["GET", "/api/me/bubbles", {}],
      ["PUT", "/api/me/bubbles", {}],
      ["GET", "/api/projects", {}],
      ["GET", "/api/auth/me", {}],
      ["GET", "/api/tickets/AT-1", {}],
      ["GET", "/api/events/stream", {}], // every event
      ["GET", "/api/events/stream", { types: "ticket.moved" }],
      ["GET", "/api/events", { types: "dm.created,ticket.moved" }],
      ["GET", "/api/dm/messages/../../tickets", {}],
    ] as const) {
      assert.throws(() => allowedSessionPath(method as "GET" | "POST", p, query as Record<string, string>), `${method} ${p} must be refused`);
    }
  });

  it("takes loops' session cookie from Set-Cookie and leaves the device cookie alone", () => {
    assert.equal(sessionCookieOf(["chl_device=dev_1; HttpOnly; Path=/api/auth", "chl_session=sess_abc; HttpOnly; Max-Age=2592000; Path=/; SameSite=lax"]), "sess_abc");
    assert.equal(sessionCookieOf(["chl_device=dev_1; Path=/api/auth"]), null);
    assert.equal(sessionCookieOf([]), null);
  });
});

describe("the person's chat session", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });
  function folder(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-session-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    return path.join(dir, "crewhub-world");
  }
  async function startHost(stubUrl: string, key: string, configDir: string, extra: Record<string, unknown> = {}) {
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stubUrl, key, keyName: "crewhub-world", keySource: "env", sessionStore: createSessionStore(configDir), pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line), ...extra });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    const signIn = (body: unknown, headers: Record<string, string> = { origin: host.url, "content-type": "application/json" }) =>
      fetch(`${host.url}/world-api/session`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
    const forget = () => fetch(`${host.url}/world-api/session`, { method: "DELETE", headers: { origin: host.url } });
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    return { host, lines, health, signIn, forget };
  }
  const file = (dir: string) => path.join(dir, "loops-session");
  const sayings = (stub: LoopsStub) => stub.requests.filter((r) => r.cookie !== undefined).map((r) => r.path);

  it("signs in as the person over loopback, keeps only the cookie (0600), says who in health, and never the password", async () => {
    const stub = await createLoopsStub({ ...installation(), person: PERSON, dm: { messages: { [AGENT_MESSAGE.id]: AGENT_MESSAGE } } });
    cleanup.push(() => stub.close());
    const dir = folder();
    const { host, lines, health, signIn } = await startHost(stub.url, stub.key, dir);
    assert.deepEqual((await health()).connection.session, { state: "signed-out" }, "off by default");
    assert.equal((await signIn({ id: PERSON.id, password: PERSON.password }, { "content-type": "application/json" })).status, 403, "no Origin: not the world's page");
    const wrong = await signIn({ id: PERSON.id, password: "nope" });
    assert.equal(wrong.status, 401);
    assert.deepEqual(await wrong.json(), { error: "bad_credentials", reason: "Unknown account or wrong password" });
    assert.equal((await health()).connection.session.state, "signed-out");
    const ok = await signIn({ id: PERSON.id, password: PERSON.password });
    assert.equal(ok.status, 200);
    const answer = (await ok.json()) as Record<string, any>;
    assert.deepEqual(answer.connection.session, { state: "signed-in", name: "Nicky", id: "nicky", at: answer.connection.session.at });
    assert.ok(!Number.isNaN(Date.parse(answer.connection.session.at)));
    // The file: the cookie and who, mode 0600; the password nowhere in it.
    assert.equal(statSync(file(dir)).mode & 0o777, 0o600);
    const kept = JSON.parse(readFileSync(file(dir), "utf8"));
    assert.equal(kept.v, 1);
    assert.equal(kept.cookie, stub.sessionCookies()[0]);
    assert.deepEqual(kept.user, { id: "nicky", displayName: "Nicky" });
    assert.ok(!readFileSync(file(dir), "utf8").includes(PERSON.password));
    // The sign-in went to loops with the password, once, with no Origin (loops: an absent Origin is fine), the key never beside it.
    const logins = stub.requests.filter((r) => r.path === "/api/auth/login");
    assert.equal(logins.length, 2, "the wrong and the right one");
    assert.ok(logins.every((r) => r.authorization === undefined && r.cookie === undefined), "a sign-in carries neither the key nor a cookie");
    assert.ok(logins[1]?.body?.includes(PERSON.password), "the password went to loops' sign-in, where it must");
    assert.ok(stub.requests.filter((r) => r.path !== "/api/auth/login").every((r) => !(r.body ?? "").includes(PERSON.password)), "and nowhere else");
    // Never in a log line, never in health; the cookie neither.
    const cookie = stub.sessionCookies()[0] as string;
    const everything = [...lines, JSON.stringify(await health()), JSON.stringify(answer), JSON.stringify(host.connection())].join("\n");
    assert.ok(!everything.includes(PERSON.password), "the password is in no log line and no answer");
    assert.ok(!everything.includes(cookie), "the cookie is in no log line and no answer");
    assert.ok(lines.some((l) => /signed in to crewhub-loops as Nicky for the chat's bubbles/.test(l)), lines.join("\n"));
    // The dm stream opened as the person, filtered to dm.*; the key's own stream is untouched.
    await waitFor("the dm stream", () => stub.requests.some((r) => r.path.startsWith("/api/events/stream?") && r.cookie !== undefined));
    const dmStream = stub.requests.find((r) => r.path.startsWith("/api/events/stream?") && r.cookie !== undefined);
    assert.equal(dmStream?.path, "/api/events/stream?types=dm.created%2Cdm.answered");
    assert.equal(dmStream?.authorization, undefined, "the cookie's stream never carries the key");
    assert.equal((await health()).connection.stream.state, "ok");
    // An unpaired browser sees the state only.
    const bare = await createHost({ loopsUrl: stub.url, key: stub.key, keyName: "crewhub-world", sessionStore: createSessionStore(dir), pairing: "on", retryMs: { min: 20, max: 100 }, log: () => undefined });
    cleanup.push(() => bare.close());
    const unpaired = (await (await fetch(`${bare.url}/world-api/health`)).json()) as Record<string, any>;
    assert.deepEqual(unpaired.connection.session, { state: "signed-in" }, "states only: no name, no id");
  });

  it("an agent's message becomes one chat line for every tab (the first line, read by id); the person's own says nothing", async () => {
    const stub = await createLoopsStub({ ...installation(), person: PERSON, dm: { messages: { [AGENT_MESSAGE.id]: AGENT_MESSAGE, [PERSON_MESSAGE.id]: PERSON_MESSAGE } } });
    cleanup.push(() => stub.close());
    const { host, signIn } = await startHost(stub.url, stub.key, folder());
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    assert.equal((await signIn({ id: PERSON.id, password: PERSON.password })).status, 200);
    await waitFor("the dm stream", () => stub.requests.some((r) => r.path.startsWith("/api/events/stream?") && r.cookie !== undefined));
    // The person wrote: dm.created by a user. Nothing over the person.
    stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "nicky", kind: "user" }, recipientIds: ["boing"], payload: { threadId: "dmt_boing", messageId: PERSON_MESSAGE.id, agentId: "boing" } });
    // The agent answered: dm.created by the agent, then dm.answered.
    stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "boing", kind: "agent" }, recipientIds: ["nicky"], payload: { threadId: "dmt_boing", messageId: AGENT_MESSAGE.id, agentId: "boing" } });
    stub.emit({ type: "dm.answered", project: null, ticket: null, actor: { id: "boing", kind: "agent" }, recipientIds: ["nicky"], payload: { threadId: "dmt_boing", messageId: PERSON_MESSAGE.id, agentId: "boing" } });
    const chat = await tab.next((m) => m.type === "chat");
    assert.deepEqual(chat, { type: "chat", chat: { agentId: "boing", agentName: "Boing", text: "On it. The nook is done,", at: AGENT_MESSAGE.createdAt, messageId: AGENT_MESSAGE.id, threadId: "dmt_boing" } });
    assert.equal(tab.messages.filter((m) => m.type === "chat").length, 1, "one line: the agent's, not the person's");
    // What the session asked of loops: the stream and the one message by id, nothing else; the person's message was never read.
    assert.deepEqual(sayings(stub).filter((p) => !p.startsWith("/api/events/stream")), [`/api/dm/messages/${AGENT_MESSAGE.id}`]);
    // A tab's event stream still carries the key's events as before.
    stub.emit({ type: "ticket.moved", project: { slug: "atlas", key: "AT" }, ticket: { id: "tk_1", key: "AT-1", title: "First" }, actor: { id: "x", kind: "user" }, recipientIds: [], payload: {} });
    await tab.next((m) => m.type === "event");
  });

  it("a kept session is used on the next start; when loops no longer accepts it the state is expired, nothing is retried, and a new sign-in mends it", async () => {
    const stub = await createLoopsStub({ ...installation(), person: PERSON, dm: { messages: { [AGENT_MESSAGE.id]: AGENT_MESSAGE } } });
    cleanup.push(() => stub.close());
    const dir = folder();
    const a = await startHost(stub.url, stub.key, dir);
    assert.equal((await a.signIn({ id: PERSON.id, password: PERSON.password })).status, 200);
    await a.host.close();
    cleanup.pop();
    const b = await startHost(stub.url, stub.key, dir);
    assert.equal((await b.health()).connection.session.state, "signed-in", "the kept session, without a password");
    assert.equal((await b.health()).connection.session.name, "Nicky");
    await waitFor("the dm stream with the kept cookie", () => stub.requests.filter((r) => r.path.startsWith("/api/events/stream?") && r.cookie !== undefined).length >= 2);
    assert.equal(stub.requests.filter((r) => r.path === "/api/auth/login").length, 1, "no second sign-in: the cookie is enough");
    // Loops forgets the session (signed out elsewhere, 30 days): the open stream is left, the next read is refused.
    stub.expireSessions();
    stub.endStreams();
    await waitFor("expired", async () => (await b.health()).connection.session.state === "expired");
    assert.equal((await b.health()).connection.session.name, "Nicky", "who it was stays said");
    assert.ok(b.lines.some((l) => /no longer accepted by crewhub-loops \(401\): sign in again/.test(l)), b.lines.join("\n"));
    const asked = stub.requests.length;
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(stub.requests.filter((r) => r.cookie !== undefined).length, stub.requests.slice(0, asked).filter((r) => r.cookie !== undefined).length, "no retry with an expired cookie");
    assert.equal((await b.health()).connection.key.state, "ok", "the key is another matter");
    // Signed in again: a new cookie, the file rewritten, the stream back.
    assert.equal((await b.signIn({ id: PERSON.id, password: PERSON.password })).status, 200);
    assert.equal((await b.health()).connection.session.state, "signed-in");
    assert.equal(JSON.parse(readFileSync(file(dir), "utf8")).cookie, stub.sessionCookies()[1]);
    await waitFor("the dm stream again", () => stub.requests.filter((r) => r.path.startsWith("/api/events/stream?") && r.cookie === `chl_session=${stub.sessionCookies()[1]}`).length >= 1);
  });

  it("Forget the session signs out at loops and deletes the file; loops' pacing is passed on as 429", async () => {
    const stub = await createLoopsStub({ ...installation(), person: PERSON });
    cleanup.push(() => stub.close());
    const dir = folder();
    const { health, signIn, forget, lines } = await startHost(stub.url, stub.key, dir);
    assert.equal((await signIn({ id: PERSON.id, password: PERSON.password })).status, 200);
    await waitFor("the dm stream", () => stub.requests.some((r) => r.path.startsWith("/api/events/stream?") && r.cookie !== undefined));
    assert.equal((await forget()).status, 200);
    assert.deepEqual((await health()).connection.session, { state: "signed-out" });
    assert.throws(() => statSync(file(dir)), "the file is gone");
    const logout = stub.requests.find((r) => r.path === "/api/auth/logout");
    assert.equal(logout?.method, "POST");
    assert.equal(logout?.cookie, `chl_session=${stub.sessionCookies()[0]}`, "signed out at loops with the cookie it kept");
    await waitFor("the dm stream closed", () => stub.openStreams() === 1, 5000);
    assert.ok(lines.some((l) => /is forgotten \(signed out at crewhub-loops/.test(l)));
    // Loops' pacing after failed attempts: the host passes the 429 on, with loops' words.
    const busy = await createLoopsStub({ ...installation(), person: PERSON, loginBusy: true });
    cleanup.push(() => busy.close());
    const paced = await startHost(busy.url, busy.key, folder());
    const answer = await paced.signIn({ id: PERSON.id, password: PERSON.password });
    assert.equal(answer.status, 429);
    assert.deepEqual(await answer.json(), { error: "too_many_attempts", reason: "Too many login attempts, wait a moment" });
    assert.equal((await paced.health()).connection.session.state, "signed-out");
  });

  it("a session file others could read, or a malformed one, is not trusted", async () => {
    const dir = folder();
    const store = createSessionStore(dir);
    store.save({ v: 1, cookie: "sess_x", user: { id: "nicky", displayName: "Nicky" }, at: "2026-10-21T19:00:00.000Z" });
    assert.equal(store.read()?.cookie, "sess_x");
    const { chmodSync, writeFileSync } = await import("node:fs");
    chmodSync(store.file, 0o644);
    assert.equal(store.read(), null, "mode 0644: refused");
    chmodSync(store.file, 0o600);
    writeFileSync(store.file, "{\"v\":1,\"cookie\":\"\"}");
    assert.equal(store.read(), null);
    store.forget();
    assert.equal(store.read(), null);
  });
});
