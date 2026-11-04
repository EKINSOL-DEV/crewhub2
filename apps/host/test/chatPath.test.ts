/**
 * The viewer key's chat path (round 59d, C4), through its interface with a fake client: no host, no stub, no stream.
 * What stood in chatKey.test.ts through the host (and still does, against the stub): the verdict and its one log line
 * on a viewer whose threads answer 200, 403 or 409 and on a plain key; the threads at the check and again, once, after
 * a burst of dm events; an agent's dm.created read by id as one line, the person's own never read. New here: the
 * verdict unknown before the check and after a dispose in flight, a second check that asks nothing, no timer and no
 * line after dispose, a failed read as no line.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Envelope } from "@crewhub/loops-client";
import { createChatPath, THREADS_REFRESH_MS, type ChatPathOptions } from "../src/chatPath.ts";

type Answer = { status: number; body: unknown } | Error;

/** A loops of answers by path: `getJson` records the paths it was asked and answers from the map (a missing path: 404). */
function fakeLoops(answers: Record<string, Answer | (() => Answer | Promise<Answer>)>) {
  const asked: string[] = [];
  const client: ChatPathOptions["client"] = {
    async getJson<T>(path: string) {
      asked.push(path);
      const entry = answers[path];
      const answer = entry === undefined ? { status: 404, body: null } : typeof entry === "function" ? await entry() : entry;
      if (answer instanceof Error) throw answer;
      return { status: answer.status, body: answer.body as T | null };
    },
  };
  return { client, asked };
}

const VIEWER = { agents: [{ id: "boing", displayName: "Boing" }, { id: "crewhub-world", displayName: "World", viewer: true }] };
const PLAIN = { agents: [{ id: "boing", displayName: "Boing" }, { id: "crewhub-world", displayName: "World" }] };
const THREADS = { threads: [{ id: "dmt_boing", agentId: "boing", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 }, { id: "dmt_bad" }] };
const MESSAGE = { message: { id: "dm_k1", bodyText: "Done with the lamp.\nNext: the rug.", createdAt: "2026-10-21T20:00:00.000Z", author: { id: "boing", kind: "agent", displayName: "Boing" } } };
const dm = (type: string, actor: Envelope["actor"], payload: Envelope["payload"]): Envelope => ({ v: 1, seq: 1, ts: "t", type, project: null, ticket: null, actor, recipientIds: [], payload });
const AGENT_DM = dm("dm.created", { id: "boing", kind: "agent" }, { threadId: "dmt_boing", messageId: "dm_k1", agentId: "boing" });
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
/** Waits until `ready` holds (polled, no deadline a loaded machine could miss short of 10 s): timing-proof (arch-ports, round 59d). */
async function until(ready: () => boolean, what: string): Promise<void> {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > 10_000) throw new Error(`waited 10 s for ${what}`);
    await tick();
  }
}

function build(answers: Parameters<typeof fakeLoops>[0], refreshMs = 10) {
  const loops = fakeLoops(answers);
  const lines: string[] = [];
  const threads: unknown[] = [];
  const said: unknown[] = [];
  const chat = createChatPath({ client: loops.client, keyName: "crewhub-world", log: (l) => lines.push(l), onThreads: (t) => threads.push(t), onLine: (l) => said.push(l), refreshMs });
  return { chat, ...loops, lines, threads, said };
}

describe("the viewer key's chat path", () => {
  it("unknown until asked; a viewer whose threads answer 200 reads the chat: the facts of the three fields, one log line that counts them, asked once", async () => {
    const { chat, asked, lines, threads } = build({ "/api/agents": { status: 200, body: VIEWER }, "/api/dm/threads": { status: 200, body: THREADS } });
    assert.equal(chat.reads(), "unknown");
    assert.equal(chat.threads(), null);
    await chat.check();
    assert.equal(chat.reads(), "yes");
    assert.deepEqual(chat.threads(), [{ agentId: "boing", lastMessageAt: "2026-10-22T07:05:00.174Z", unreadCount: 1 }]);
    assert.deepEqual(threads, [chat.threads()], "the threads handed on at the check");
    assert.deepEqual(asked, ["/api/agents", "/api/dm/threads"]);
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /^the key reads the chat on this crewhub-loops: .*; 1 chat thread\(s\)$/);
    await chat.check();
    assert.deepEqual(asked, ["/api/agents", "/api/dm/threads"], "a second check asks nothing");
    assert.equal(lines.length, 1);
    const { chat: empty, lines: emptyLines } = build({ "/api/agents": { status: 200, body: VIEWER }, "/api/dm/threads": { status: 200, body: { threads: [] } } });
    await empty.check();
    assert.match(emptyLines[0]!, /0 chat thread\(s\) \(none yet is no error/);
  });

  it("a plain key is no viewer: the threads are not asked, no, and the no-viewer-key line; a loops that lists no agent of the key's name the same", async () => {
    const plain = build({ "/api/agents": { status: 200, body: PLAIN }, "/api/dm/threads": { status: 200, body: THREADS } });
    await plain.chat.check();
    assert.equal(plain.chat.reads(), "no");
    assert.equal(plain.chat.threads(), null);
    assert.deepEqual(plain.asked, ["/api/agents"], "the flag decides: a plain key's 200 on the threads is never read");
    assert.deepEqual(plain.threads, []);
    assert.match(plain.lines[0]!, /^the key does not read the chat on this crewhub-loops \(no viewer key\): .*CHL_WORLD_ORIGIN/);
    const unlisted = build({ "/api/agents": { status: 200, body: { agents: [] } } });
    await unlisted.chat.check();
    assert.equal(unlisted.chat.reads(), "no");
    assert.deepEqual(unlisted.asked, ["/api/agents"]);
  });

  it("a viewer whose threads loops refuses (403) or whose chat bubbles feature is off (409): no, and the line says which, never 'no viewer key'", async () => {
    const refused = build({ "/api/agents": { status: 200, body: VIEWER }, "/api/dm/threads": { status: 403, body: { error: { code: "forbidden" } } } });
    await refused.chat.check();
    assert.equal(refused.chat.reads(), "no");
    assert.match(refused.lines[0]!, /^the viewer key reads no chat on this crewhub-loops \(GET \/api\/dm\/threads answered 403\)/);
    assert.ok(!/no viewer key/.test(refused.lines[0]!));
    const off = build({ "/api/agents": { status: 200, body: VIEWER }, "/api/dm/threads": { status: 409, body: { error: { code: "feature_off" } } } });
    await off.chat.check();
    assert.equal(off.chat.reads(), "no");
    assert.match(off.lines[0]!, /chat bubbles feature is switched off there \(Settings > Features\)/);
    assert.ok(!/no viewer key/.test(off.lines[0]!));
  });

  it("loops not answering the question (a read that throws, a non-200 agents list) is no, not unknown, with the no-viewer-key line", async () => {
    const down = build({ "/api/agents": new Error("ECONNREFUSED") });
    await down.chat.check();
    assert.equal(down.chat.reads(), "no");
    assert.match(down.lines[0]!, /no viewer key/);
    const refused = build({ "/api/agents": { status: 403, body: null } });
    await refused.chat.check();
    assert.equal(refused.chat.reads(), "no");
  });

  it("where the key reads the chat: a burst of dm events has the threads read again once, after refreshMs, and handed on; an agent's dm.created becomes one line read by id, the person's own is never read", async () => {
    let threadsBody: unknown = THREADS;
    const { chat, asked, threads, said } = build({ "/api/agents": { status: 200, body: VIEWER }, "/api/dm/threads": () => ({ status: 200, body: threadsBody }), "/api/dm/messages/dm_k1": { status: 200, body: MESSAGE } });
    await chat.check();
    asked.length = 0;
    threadsBody = { threads: [{ agentId: "boing", lastMessageAt: "2026-10-22T08:00:00.000Z", unreadCount: 2 }] };
    chat.onEvent(dm("dm.created", { id: "nicky", kind: "user" }, { threadId: "dmt_boing", messageId: "dm_p9", agentId: "boing" }));
    chat.onEvent(AGENT_DM);
    chat.onEvent(dm("dm.answered", { id: "boing", kind: "agent" }, { threadId: "dmt_boing", messageId: "dm_p9" }));
    chat.onEvent(dm("ticket.moved", { id: "boing", kind: "agent" }, {}));
    // The message's read starts in onEvent itself, before any timer can run; the one re-read comes after refreshMs.
    await until(() => asked.includes("/api/dm/threads") && said.length > 0, "the re-read and the line");
    assert.deepEqual(said, [{ agentId: "boing", agentName: "Boing", text: "Done with the lamp.", at: "2026-10-21T20:00:00.000Z", messageId: "dm_k1", threadId: "dmt_boing" }]);
    assert.deepEqual(asked, ["/api/dm/messages/dm_k1", "/api/dm/threads"], "the agent's message read by id first, the person's never, then one re-read for the three dm events");
    assert.deepEqual(threads.at(-1), [{ agentId: "boing", lastMessageAt: "2026-10-22T08:00:00.000Z", unreadCount: 2 }]);
    assert.deepEqual(chat.threads(), threads.at(-1));
    assert.equal(THREADS_REFRESH_MS, 1000);
  });

  it("a message read that answers no 200, no readable message, a null payload or an odd id is no line, and never a throw; a re-read that fails keeps the facts", async () => {
    const thrown: unknown[] = [];
    process.once("unhandledRejection", (e) => thrown.push(e));
    // The threads answer 200 at the check and 500 at the re-read.
    let status = 200;
    const { chat, asked, said, threads } = build({
      "/api/agents": { status: 200, body: VIEWER },
      "/api/dm/threads": () => ({ status, body: THREADS }),
      "/api/dm/messages/dm_404": { status: 404, body: null },
      "/api/dm/messages/dm_bad": { status: 200, body: { message: { bodyText: "   " } } },
      "/api/dm/messages/dm_err": new Error("reset"),
    });
    await chat.check();
    status = 500;
    for (const id of ["dm_404", "dm_bad", "dm_err"]) chat.onEvent(dm("dm.created", { id: "boing", kind: "agent" }, { threadId: "dmt_boing", messageId: id, agentId: "boing" }));
    chat.onEvent({ ...AGENT_DM, payload: null as unknown as Envelope["payload"] });
    chat.onEvent(dm("dm.created", { id: "boing", kind: "agent" }, { threadId: "dmt_boing", messageId: "m/3", agentId: "boing" }));
    await until(() => asked.filter((p) => p === "/api/dm/threads").length === 2, "the re-read");
    await tick();
    assert.deepEqual(said, []);
    assert.deepEqual(asked.filter((p) => p.startsWith("/api/dm/messages/")), ["/api/dm/messages/dm_404", "/api/dm/messages/dm_bad", "/api/dm/messages/dm_err"], "the odd id and the null payload are never read");
    assert.equal(asked.filter((p) => p === "/api/dm/threads").length, 2, "the check's read and the one re-read");
    assert.equal(threads.length, 1, "the failed re-read hands nothing on");
    assert.deepEqual(chat.threads(), threads[0]);
    assert.deepEqual(thrown, []);
  });

  it("where the key does not read the chat, or before the check, a dm event is nothing: no read, no timer", async () => {
    const plain = build({ "/api/agents": { status: 200, body: PLAIN }, "/api/dm/messages/dm_k1": { status: 200, body: MESSAGE } });
    plain.chat.onEvent(AGENT_DM);
    await plain.chat.check();
    plain.chat.onEvent(AGENT_DM);
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(plain.asked, ["/api/agents"]);
    assert.deepEqual(plain.said, []);
  });

  it("dispose: a check in flight keeps nothing and says nothing; no re-read timer fires; a line read in flight is dropped", async () => {
    let release: (() => void) | null = null;
    const slow = build({ "/api/agents": () => new Promise<Answer>((resolve) => (release = () => resolve({ status: 200, body: VIEWER }))), "/api/dm/threads": { status: 200, body: THREADS } });
    const checking = slow.chat.check();
    slow.chat.dispose();
    release!();
    await checking;
    assert.equal(slow.chat.reads(), "unknown");
    assert.deepEqual(slow.lines, []);
    assert.deepEqual(slow.threads, []);
    let open: (() => void) | null = null;
    const live = build({ "/api/agents": { status: 200, body: VIEWER }, "/api/dm/threads": { status: 200, body: THREADS }, "/api/dm/messages/dm_k1": () => new Promise<Answer>((resolve) => (open = () => resolve({ status: 200, body: MESSAGE }))) });
    await live.chat.check();
    live.asked.length = 0;
    live.chat.onEvent(AGENT_DM);
    // The message's read has started (onEvent asks the client at once); the re-read timer is set; dispose before either answers.
    const answer = open as unknown as (() => void) | null;
    assert.ok(answer !== null, "the message read started in onEvent");
    live.chat.dispose();
    answer();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(live.said, [], "the line in flight is dropped");
    assert.deepEqual(live.asked, ["/api/dm/messages/dm_k1"], "the re-read timer was cleared: no threads read");
    assert.equal(live.chat.reads(), "yes", "the verdict stands for whoever still asks");
  });
});
