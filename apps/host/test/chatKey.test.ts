/**
 * The chat over the key, the one road since round 19: a crewhub-loops whose viewer key may read the chat (the key's own
 * entry in `GET /api/agents` says `viewer: true`, and `GET /api/dm/threads` answers 200 to it). The host notices at the
 * key check, says `session: key` in health, and turns an agent's `dm.created` on the key's own stream into a chat line
 * (the message read by id with the key, chatLine.ts). A loops that does not let the key read the chat gets no
 * `connection.session` at all and a log line that says how to make a viewer key; `/world-api/session`, the sign-in road
 * of rounds 12 to 18, is gone (404). Against the stub.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { createLoopsStub, installation } from "./loopsStub.ts";
import { openSse } from "./sse.ts";
import { waitFor } from "./wait.ts";

const AGENT_MESSAGE = { id: "dm_k1", threadId: "dmt_boing", agentId: "boing", author: { id: "boing", kind: "agent", displayName: "Boing" }, bodyText: "Done with the lamp.\nNext: the rug.", bodyMarkdown: "Done with the lamp.", createdAt: "2026-10-21T20:00:00.000Z" };

describe("the chat over the key, where loops allows it", () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanup.reverse()) await fn();
    cleanup.length = 0;
  });
  async function startHost(stubUrl: string, key: string) {
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stubUrl, key, keyName: "crewhub-world", keySource: "env", pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line) });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    return { host, lines, health };
  }

  it("a loops whose key reads the chat: health says key, an agent's message on the key's stream is a bubble line, the threads' facts reach the tab (round 24), and the sign-in road is gone", async () => {
    const THREAD = { id: "dmt_boing", agentId: "boing", createdAt: "2026-10-21T18:00:00.000Z", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 };
    const stub = await createLoopsStub({ ...installation(), keyReadsChat: true, dm: { threads: [THREAD, { id: "dmt_bad" }], messages: { [AGENT_MESSAGE.id]: AGENT_MESSAGE } } });
    cleanup.push(() => stub.close());
    const { host, lines, health } = await startHost(stub.url, stub.key);
    assert.deepEqual((await health()).connection.session, { state: "key" });
    assert.ok(lines.some((l) => /the key reads the chat on this crewhub-loops/.test(l)), lines.join("\n"));
    assert.ok(stub.requests.some((r) => r.path === "/api/dm/threads" && r.authorization !== undefined && r.cookie === undefined), "the probe with the key");
    assert.ok(stub.requests.every((r) => r.cookie === undefined), "never a cookie: the host holds no person's session");
    // The route is gone: a read of it is an unknown route (404), a write to it is refused by the write gate, which knows
    // `/connect` only (405); nothing of a sign-in is read or forwarded.
    for (const [method, status] of [["POST", 405], ["DELETE", 405], ["GET", 404]] as const) {
      const gone = await fetch(`${host.url}/world-api/session`, { method, headers: { origin: host.url, "content-type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify({ id: "nicky", password: "x" }) } : {}) });
      assert.equal(gone.status, status, `${method} /world-api/session is gone`);
    }
    assert.equal(stub.requests.filter((r) => r.path === "/api/auth/login").length, 0, "no sign-in ever sent to loops");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    // The threads' facts (round 24): the probe's own answer, sent to the tab as it attached; only the three fields, a row without them dropped.
    await waitFor("the threads at attach", async () => tab.messages.some((m) => m.type === "threads"));
    const threadsAtAttach = tab.messages.filter((m) => m.type === "threads");
    assert.deepEqual(threadsAtAttach[0], { type: "threads", threads: [{ agentId: "boing", lastMessageAt: THREAD.lastMessageAt, unreadCount: 1 }] });
    const threadReadsBefore = stub.requests.filter((r) => r.path === "/api/dm/threads").length;
    assert.equal(threadReadsBefore, 1, "the probe's one read, nothing polled");
    stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "nicky", kind: "user" }, recipientIds: ["boing"], payload: { threadId: "dmt_boing", messageId: "dm_p9", agentId: "boing" } });
    stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "boing", kind: "agent" }, recipientIds: ["nicky"], payload: { threadId: "dmt_boing", messageId: AGENT_MESSAGE.id, agentId: "boing" } });
    const chat = await tab.next((m) => m.type === "chat");
    assert.deepEqual(chat, { type: "chat", chat: { agentId: "boing", agentName: "Boing", text: "Done with the lamp.", at: AGENT_MESSAGE.createdAt, messageId: AGENT_MESSAGE.id, threadId: "dmt_boing" } });
    assert.equal(tab.messages.filter((m) => m.type === "chat").length, 1, "the agent's line only");
    const read = stub.requests.find((r) => r.path === `/api/dm/messages/${AGENT_MESSAGE.id}`);
    assert.ok(read && read.authorization !== undefined && read.cookie === undefined, "read by id with the key");
    assert.ok(!stub.requests.some((r) => r.path === "/api/dm/messages/dm_p9"), "the person's message never read");
    // After the dm.* events the threads are read once more (the two events coalesced) and sent again, whole.
    await waitFor("the threads after the events", async () => tab.messages.filter((m) => m.type === "threads").length > threadsAtAttach.length);
    const again = tab.messages.filter((m) => m.type === "threads").at(-1);
    assert.deepEqual(again, { type: "threads", threads: [{ agentId: "boing", lastMessageAt: THREAD.lastMessageAt, unreadCount: 1 }] });
    assert.equal(stub.requests.filter((r) => r.path === "/api/dm/threads").length, 2, "one re-read for the two events, with the key");
    assert.ok(stub.requests.filter((r) => r.path === "/api/dm/threads").every((r) => r.authorization !== undefined && r.cookie === undefined));
  });

  it("a loops that does not let the key read the chat: no session in health (no bubbles), a log line that says how to make a viewer key, and no sign-in road", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { host, health, lines } = await startHost(stub.url, stub.key);
    const h = await health();
    assert.equal(h.connection.session, undefined, "no chat road: the field is absent");
    // The probe: the key's own entry in the agents list (no `viewer` on this loops), so the threads are not even asked.
    assert.ok(stub.requests.some((r) => r.path === "/api/agents" && r.authorization !== undefined), "the agents list read with the key");
    assert.ok(!stub.requests.some((r) => r.path === "/api/dm/threads"), "a plain key is not a viewer: the chat is not asked for");
    assert.ok(!lines.some((l) => /the key reads the chat on/.test(l)));
    assert.ok(lines.some((l) => /the key does not read the chat on this crewhub-loops \(no viewer key\): no bubbles over the key; make a viewer key in Settings > Agents > Connect CrewHub World .*, or set CHL_WORLD_ORIGIN to the world page's origin/.test(l)), lines.join("\n"));
    assert.equal((await fetch(`${host.url}/world-api/session`, { method: "POST", headers: { origin: host.url, "content-type": "application/json" }, body: "{}" })).status, 405, "no sign-in road: the write gate knows /connect only");
    assert.equal((await fetch(`${host.url}/world-api/session`)).status, 404, "an unknown route");
    // No threads message either (round 24): the card keeps its honest words.
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(!tab.messages.some((m) => m.type === "threads"), "no thread facts where the key cannot read the chat");
  });
});
