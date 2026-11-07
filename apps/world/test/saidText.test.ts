import assert from "node:assert/strict";
import test from "node:test";
import { SAID_MS } from "../src/state/said.ts";
import { markLabel, markWords, saidLines, saidMarks } from "../src/world/saidText.ts";
import { agent, building, world } from "./fixtures.ts";

const t0 = 1_000_000;
const said = (agentId: string, text: string, shownAt = t0) => [agentId, { text, agentName: agentId, messageId: `dm_${agentId}`, threadId: `dmt_${agentId}`, shownAt, until: shownAt + SAID_MS }] as const;
const model = world([building("inbox", [agent("crewhub-lead", "lead-office", { name: "crewhub-lead", displayName: "crewhub-lead", building: "inbox" }), agent("cr-dev-1", "planning", { name: "cr-dev-1", displayName: "CR Dev 1", building: "inbox" }), agent("ghost", "planning", { name: "ghost", displayName: "Ghost", presence: "proxy", building: "inbox" })])], {
  townHall: [agent("g-man", "lead-office", { name: "g-man", displayName: "G-Man", room: null })],
  postOffice: [agent("postman", "lobby", { name: "postman", displayName: "Postman", room: null })],
});
// The fixture labels a room by its kind; the model labels it as the sign reads.
for (const r of model.buildings[0]!.rooms) if (r.kind === "lead-office") r.label = "Lead's office";
const civic = { hall: "lodge", post: "mail hut" };

test("saidLines: a says line in the Town section per live line, with the place; expired lines and proxies say nothing", () => {
  const map = new Map([said("crewhub-lead", "Answer from crewhub-lead: the bubble proof on 8292."), said("g-man", "Busy and calm."), said("postman", "Delivered."), said("ghost", "Boo.")]);
  const lines = saidLines(model, map, t0 + 1000, civic);
  assert.deepEqual(
    lines.map((l) => [l.section, l.kind, l.text]),
    [
      ["Town", "fact", "crewhub-lead says: Answer from crewhub-lead: the bubble proof on 8292. (in the lead's office of inbox)"],
      ["Town", "fact", "G-Man says: Busy and calm. (at the lodge)"],
      ["Town", "fact", "Postman says: Delivered. (at the mail hut)"],
    ],
  );
  assert.equal(saidLines(model, map, t0 + SAID_MS, civic).length, 0, "gone with the bubbles");
  assert.equal(saidLines(model, new Map(), t0, civic).length, 0);
  assert.match(saidLines(model, new Map([said("crewhub-lead", "In the hall.")]), t0, civic, "three-rooms")[0]!.text, /\(in the lead's office of inbox\)$/, "the hall's name in the three-room wording");
});

test("saidMarks: one chat mark per real agent inside a building with a live line, none for the town's own figures or a proxy", () => {
  const map = new Map([said("crewhub-lead", "The proof.", t0 - SAID_MS + 2000), said("cr-dev-1", "Also me."), said("g-man", "Busy and calm."), said("ghost", "Boo.")]);
  const marks = saidMarks(model, map, t0);
  assert.deepEqual(
    marks.map((m) => [m.slug, m.building, m.agent, m.name, m.text, m.fading]),
    [
      ["inbox", "inbox", "crewhub-lead", "crewhub-lead", "The proof.", true],
      ["inbox", "inbox", "cr-dev-1", "CR Dev 1", "Also me.", false],
    ],
  );
  assert.equal(markLabel(marks[0]!), "crewhub-lead answered: open inbox");
  assert.equal(markWords(marks[1]!), "CR Dev 1 answered");
  assert.equal(saidMarks(model, map, t0 + SAID_MS).length, 0, "gone with the bubbles");
});
