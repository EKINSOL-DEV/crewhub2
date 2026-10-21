/**
 * The key road of the chat (round 12 follow-up): a crewhub-loops whose viewer key may read the chat (the key's own entry in `GET /api/agents`
 * says `viewer: true`, and `GET /api/dm/threads` answers 200 to it) needs no person's session. The host notices at the key check, says `session: key` in health,
 * refuses a sign-in as not needed, leaves a stored session unused, and turns an agent's `dm.created` on the key's own
 * stream into a chat line (the message read by id with the key). A loops that refuses the key the chat keeps the
 * session road. Against the stub.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { createHost } from "../src/host.ts";
import { createSessionStore } from "../src/session.ts";
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
  function folder(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "chw-chatkey-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    return path.join(dir, "crewhub-world");
  }
  async function startHost(stubUrl: string, key: string, configDir: string) {
    const lines: string[] = [];
    const host = await createHost({ loopsUrl: stubUrl, key, keyName: "crewhub-world", keySource: "env", sessionStore: createSessionStore(configDir), pairing: "off", retryMs: { min: 20, max: 100 }, reconnectMs: { min: 10, max: 20 }, log: (line) => lines.push(line) });
    cleanup.push(() => host.close());
    const health = async () => (await (await fetch(`${host.url}/world-api/health`)).json()) as Record<string, any>;
    await waitFor("the stream", async () => (await health()).connection.stream.state === "ok");
    return { host, lines, health };
  }

  it("a loops whose key reads the chat: health says key, a sign-in is not needed, an agent's message on the key's stream is a bubble line", async () => {
    const stub = await createLoopsStub({ ...installation(), keyReadsChat: true, dm: { threads: [{ id: "dmt_boing", agentId: "boing" }], messages: { [AGENT_MESSAGE.id]: AGENT_MESSAGE } } });
    cleanup.push(() => stub.close());
    const dir = folder();
    // A session kept from a run against another loops stays on disk and is not used here.
    createSessionStore(dir).save({ v: 1, cookie: "sess_old", user: { id: "nicky", displayName: "Nicky" }, at: "2026-10-21T19:00:00.000Z" });
    const { host, lines, health } = await startHost(stub.url, stub.key, dir);
    assert.deepEqual((await health()).connection.session, { state: "key" });
    assert.ok(lines.some((l) => /the key reads the chat on this crewhub-loops/.test(l)), lines.join("\n"));
    assert.ok(stub.requests.some((r) => r.path === "/api/dm/threads" && r.authorization !== undefined && r.cookie === undefined), "the probe with the key");
    assert.ok(stub.requests.every((r) => r.cookie === undefined), "the stored session is not used");
    const refused = await fetch(`${host.url}/world-api/session`, { method: "POST", headers: { origin: host.url, "content-type": "application/json" }, body: JSON.stringify({ id: "nicky", password: "x" }) });
    assert.equal(refused.status, 409);
    assert.equal(((await refused.json()) as { error: string }).error, "not_needed");
    assert.equal(stub.requests.filter((r) => r.path === "/api/auth/login").length, 0, "no sign-in sent to loops");
    const tab = await openSse(`${host.url}/world-api/stream?cursor=0`);
    cleanup.push(() => tab.close());
    await tab.next((m) => m.type === "status" && m.loops === "ok");
    stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "nicky", kind: "user" }, recipientIds: ["boing"], payload: { threadId: "dmt_boing", messageId: "dm_p9", agentId: "boing" } });
    stub.emit({ type: "dm.created", project: null, ticket: null, actor: { id: "boing", kind: "agent" }, recipientIds: ["nicky"], payload: { threadId: "dmt_boing", messageId: AGENT_MESSAGE.id, agentId: "boing" } });
    const chat = await tab.next((m) => m.type === "chat");
    assert.deepEqual(chat, { type: "chat", chat: { agentId: "boing", agentName: "Boing", text: "Done with the lamp.", at: AGENT_MESSAGE.createdAt, messageId: AGENT_MESSAGE.id, threadId: "dmt_boing" } });
    assert.equal(tab.messages.filter((m) => m.type === "chat").length, 1, "the agent's line only");
    const read = stub.requests.find((r) => r.path === `/api/dm/messages/${AGENT_MESSAGE.id}`);
    assert.ok(read && read.authorization !== undefined && read.cookie === undefined, "read by id with the key");
    assert.ok(!stub.requests.some((r) => r.path === "/api/dm/messages/dm_p9"), "the person's message never read");
  });

  it("a loops that refuses the key the chat keeps the session road: signed-out, the sign-in form stands", async () => {
    const stub = await createLoopsStub({ ...installation() });
    cleanup.push(() => stub.close());
    const { health, lines } = await startHost(stub.url, stub.key, folder());
    assert.deepEqual((await health()).connection.session, { state: "signed-out" });
    // The probe: the key's own entry in the agents list (no `viewer` on this loops), so the threads are not even asked.
    assert.ok(stub.requests.some((r) => r.path === "/api/agents" && r.authorization !== undefined), "the agents list read with the key");
    assert.ok(!stub.requests.some((r) => r.path === "/api/dm/threads"), "a plain key is not a viewer: the chat is not asked for");
    assert.ok(!lines.some((l) => /the key reads the chat/.test(l)));
  });
});
