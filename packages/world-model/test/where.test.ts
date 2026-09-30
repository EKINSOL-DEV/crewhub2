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
      building("cl", [agent("g-man", { presence: "proxy", building: "cl", workingIn: "cr" })]),
    ],
    {
      townHall: [agent("ux-lead", { building: null, room: null })],
      postOffice: [agent("postman", { building: null, room: null })],
      deliveries: [{ deliveryId: "d3", recipientId: "cr-dev-2", reason: "review_reply", state: "pending", toBuilding: "cr", startedAt: 0 }],
    },
  );

test("a real agent hears its zone, desk, neighbours and letters", () => {
  assert.equal(
    where(model(), "cr-dev-1"),
    "You are in the workers room of CR product at the CR-12 desk; nearby: cr-dev-2; the lobby has 2 letters for you.",
  );
});

test("a letter on its way is mentioned, and the name match ignores case", () => {
  assert.match(where(model(), "  CR-DEV-2 "), /the postman is bringing you 1 letter\./);
});

test("an agent with proxies hears where its real avatar is and where the echoes stand", () => {
  const answer = where(model(), "g-man");
  assert.match(answer, /^Your real avatar is in the lead's office of CR product, inferred from recent events/);
  assert.match(answer, /translucent proxy in CL product\.$/);
});

test("the town hall and the post office", () => {
  assert.equal(where(model(), "ux-lead"), "You are in the town hall: you are active in no building right now.");
  assert.equal(where(model(), "postman"), "You are at the post office, with 1 letter in flight.");
});

test("an unknown agent gets a plain answer, and the echoed name is cut", () => {
  assert.equal(where(model(), "ghost"), 'No agent called "ghost" is in CrewHub World.');
  assert.equal(where(model(), ""), 'No agent called "" is in CrewHub World.');
  assert.ok(where(model(), "x".repeat(200)).length < 100);
});

test("the answer stays around 40 tokens", () => {
  assert.ok(where(model(), "cr-dev-1").length / 4 <= 40);
});
