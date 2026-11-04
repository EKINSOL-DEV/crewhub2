/**
 * The key's principal, read once from `GET /api/agents` (round 61, H5): what kind of bot the key's own entry says it
 * is, and the doctor's words for it. Pure: a body and a name in, a kind out. The chat path and the doctor read through
 * this one reader, so both agree on which entry is "the key's own" and on which flag wins.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type KeyBot, keyBotWords, readKeyBot } from "../src/keyBot.ts";

const OTHERS = [{ id: "boing", displayName: "Boing", role: "lead" }, { id: "quill", displayName: "Quill", role: "dev", viewer: true }];
const listed = (self: Record<string, unknown>) => ({ agents: [...OTHERS, { id: "crewhub-world", displayName: "World", role: "lead", ...self }] });

describe("the key's bot (readKeyBot)", () => {
  it("the five kinds, from the key's own entry only", () => {
    const rows: { what: string; body: unknown; bot: KeyBot }[] = [
      { what: "a viewer (round 12, L1)", body: listed({ external: true, viewer: true }), bot: { kind: "viewer", id: "crewhub-world", role: "lead" } },
      { what: "a read-only bot (CL-313)", body: listed({ external: true, reader: true }), bot: { kind: "reader", id: "crewhub-world", role: "lead" } },
      { what: "a plain external bot (CL-314)", body: listed({ external: true }), bot: { kind: "external", id: "crewhub-world", role: "lead" } },
      { what: "an agent with a lane", body: listed({ role: "dev", herdrSession: "s1" }), bot: { kind: "lane", id: "crewhub-world", role: "dev" } },
      { what: "a laned agent whose role is missing", body: { agents: [{ id: "crewhub-world" }] }, bot: { kind: "lane", id: "crewhub-world", role: null } },
      { what: "a loops that lists no agent of the key's name", body: { agents: OTHERS }, bot: { kind: "unknown", id: "crewhub-world", role: null } },
      { what: "an empty list", body: { agents: [] }, bot: { kind: "unknown", id: "crewhub-world", role: null } },
      { what: "no agents field", body: {}, bot: { kind: "unknown", id: "crewhub-world", role: null } },
      { what: "agents that is no list", body: { agents: "crewhub-world" }, bot: { kind: "unknown", id: "crewhub-world", role: null } },
      { what: "a null body", body: null, bot: { kind: "unknown", id: "crewhub-world", role: null } },
      { what: "entries that are no objects", body: { agents: [null, "crewhub-world", 3] }, bot: { kind: "unknown", id: "crewhub-world", role: null } },
      { what: "flags that are not true", body: listed({ external: "yes", viewer: 1, reader: null }), bot: { kind: "lane", id: "crewhub-world", role: "lead" } },
    ];
    for (const row of rows) assert.deepEqual(readKeyBot(row.body, "crewhub-world"), row.bot, row.what);
  });

  it("another agent's viewer flag never counts: the kind is the key's own entry's", () => {
    assert.equal(readKeyBot({ agents: OTHERS }, "quill").kind, "viewer");
    assert.equal(readKeyBot({ agents: OTHERS }, "boing").kind, "lane");
    assert.equal(readKeyBot(listed({ external: true }), "crewhub-world").kind, "external");
  });

  it("the flags' precedence: viewer over reader over external (a viewer key reads the chat whatever else loops flags it)", () => {
    assert.equal(readKeyBot(listed({ external: true, reader: true, viewer: true }), "crewhub-world").kind, "viewer");
    assert.equal(readKeyBot(listed({ external: true, reader: true }), "crewhub-world").kind, "reader");
  });

  it("the doctor's words per kind; nothing for an unknown bot", () => {
    const words = (self: Record<string, unknown>) => keyBotWords(readKeyBot(listed(self), "crewhub-world"));
    assert.equal(words({ external: true, viewer: true }), "crewhub-world is a viewer: it reads what the world needs and writes nothing");
    assert.equal(words({ external: true, reader: true }), "this key's bot is read-only: the board will answer 403");
    assert.equal(words({ external: true }), "crewhub-world is an external bot, not read-only: it could write, the host sends GETs only");
    assert.equal(words({ role: "dev" }), "crewhub-world is a dev agent with a lane, not an external bot (it works, but an external bot is the intended key)");
    assert.equal(keyBotWords(readKeyBot({ agents: [{ id: "crewhub-world" }] }, "crewhub-world")), "crewhub-world is a lead agent with a lane, not an external bot (it works, but an external bot is the intended key)");
    assert.equal(keyBotWords(readKeyBot({ agents: [] }, "crewhub-world")), "");
  });
});
