import assert from "node:assert/strict";
import { test } from "node:test";
import { where } from "../src/where.ts";
import { agent, building, world } from "./fixtures.ts";

const model = () =>
  world(
    [
      building("cr", [
        agent("cr-dev-1", { deskTicketKey: "CR-12" }),
        agent("cr-dev-2"),
        agent("g-man", { building: "cr", room: "lead-office", locationInferred: true }),
      ], {
        mailbox: [
          { deliveryId: "d1", recipientId: "cr-dev-1", reason: "planned", state: "pending", flagged: false },
          { deliveryId: "d2", recipientId: "cr-dev-1", reason: "planned", state: "pending", flagged: false },
        ],
      }),
      building("cl", [agent("g-man", { presence: "proxy", building: "cl", workingIn: "cr" }), agent("echo", { presence: "proxy", building: "cl", workingIn: "cr" })]),
    ],
    {
      townHall: [agent("ux-lead", { building: null, room: null })],
      postOffice: [agent("postman", { building: null, room: null })],
      deliveries: [{ deliveryId: "d3", recipientId: "cr-dev-2", reason: "review_reply", state: "pending", toBuilding: "cr", startedAt: 0 }],
    },
  );

test("a person picking a name hears the third person: the agent's zone, desk, neighbours and letters (decision 8)", () => {
  assert.equal(
    where(model(), "cr-dev-1"),
    "cr-dev-1 is in the workers room of CR product at the CR-12 desk; nearby: cr-dev-2; the lobby has 2 letters for cr-dev-1.",
  );
});

test("the agent itself (the asker) hears the second person", () => {
  assert.equal(
    where(model(), "cr-dev-1", undefined, undefined, "cr-dev-1"),
    "You are in the workers room of CR product at the CR-12 desk; nearby: cr-dev-2; the lobby has 2 letters for you.",
  );
  assert.match(where(model(), "cr-dev-2", undefined, undefined, " CR-DEV-2 "), /the postman is bringing you 1 letter\./, "the asker's name is matched like the agent's: any case, trimmed");
  assert.match(where(model(), "cr-dev-1", undefined, undefined, "cr-dev-2"), /^cr-dev-1 is in/, "another agent asking hears the third person");
});

test("a letter on its way is mentioned, and the name match ignores case", () => {
  assert.match(where(model(), "  CR-DEV-2 "), /the postman is bringing cr-dev-2 1 letter\./);
});

test("an agent with proxies: where its real avatar is and where the echoes stand, in both voices", () => {
  const third = where(model(), "g-man");
  assert.match(third, /^g-man's real avatar is in the lead's office of CR product, inferred from recent events/);
  assert.match(third, /; g-man also shows as a translucent proxy in CL product\.$/);
  const second = where(model(), "g-man", undefined, undefined, "g-man");
  assert.match(second, /^Your real avatar is in the lead's office of CR product, inferred from recent events/);
  assert.match(second, /; you also show as a translucent proxy in CL product\.$/);
  // Only echoes are left (the real avatar's building is not in the model): point at the building.
  assert.equal(where(model(), "echo"), "echo's real avatar is in CR product; here echo is a translucent proxy.");
  assert.equal(where(model(), "echo", undefined, undefined, "echo"), "Your real avatar is in CR product; here you are a translucent proxy.");
});

test("the town hall and the post office, in both voices", () => {
  assert.equal(where(model(), "ux-lead"), "ux-lead is in the town hall, active in no building right now.");
  assert.equal(where(model(), "postman"), "postman is at the post office, with 1 letter in flight.");
  assert.equal(where(model(), "ux-lead", undefined, undefined, "ux-lead"), "You are in the town hall: you are active in no building right now.");
  assert.equal(where(model(), "postman", undefined, undefined, "postman"), "You are at the post office, with 1 letter in flight.");
});

test("an unknown agent gets a plain answer, and the echoed name is cut", () => {
  assert.equal(where(model(), "ghost"), 'No agent called "ghost" is in CrewHub World.');
  assert.equal(where(model(), ""), 'No agent called "" is in CrewHub World.');
  assert.ok(where(model(), "x".repeat(200)).length < 100);
});

test("the answer stays around 40 tokens", () => {
  assert.ok(where(model(), "cr-dev-1").length / 4 <= 40);
});
