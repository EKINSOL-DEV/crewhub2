import assert from "node:assert/strict";
import { test } from "node:test";
import { describeWorld, hallSummary } from "../src/describe.ts";
import { describeTownDocument } from "../src/describeTown.ts";
import { describeIntent, type Intent } from "../src/director.ts";
import { HALLS, HALL_KINDS, HALL_LABELS, RACK_NAMES, hallOf, placeWords, roomPlaceWords, roomSign, sameSign } from "../src/halls.ts";
import type { RoomKind, TransitPlace } from "../src/model.ts";
import type { Definitions } from "@crewhub/world-engine";
import { createCatalogue } from "../src/catalogue.ts";
import { ROOM_KINDS, emptyTownDocument, type PlacedProp } from "../src/townDocument.ts";
import { where } from "../src/where.ts";
import { agent, building, object, room, world } from "./fixtures.ts";

/** A building with something in every hall: four racks, a desk with a ticket, an empty analyst room, a huddle, a beacon. */
const threeRoomBuilding = () =>
  building(
    "ch",
    [
      agent("Ada", { role: "worker", room: "workers", laneStatus: "working", posture: "focused", deskTicketKey: "CH-12" }),
      agent("Bo", { role: "worker", room: "workers" }),
      agent("Lin", { role: "lead", roleSource: "fact", room: "lead-office", laneStatus: "working" }),
    ],
    {
      rooms: [
        room("lobby", "ch"),
        room("lead-office", "ch"),
        room("workers", "ch"),
        { ...room("analyst", "ch"), present: false, emptyLabel: "no analyst agents active" },
        room("storage", "ch"),
        room("planning", "ch"),
        room("review", "ch"),
        room("dispatch", "ch"),
        { ...room("meeting", "ch"), label: "Meeting room: discussing CH-12" },
      ],
      objects: [
        object("CH-1", { status: "backlog", room: "storage" }),
        object("CH-2", { status: "backlog", room: "storage" }),
        object("CH-3", { status: "planned", room: "planning" }),
        object("CH-4", { status: "review", room: "review" }),
        object("CH-5", { status: "done", room: "dispatch" }),
        object("CH-12", { status: "in_progress", room: "workers", deskOf: "Ada" }),
        object("CH-20", { status: "in_progress", room: "lead-office", deskOf: null, transit: { fromRoom: "planning", toRoom: "lead-office", toDeskOf: null, startedAt: 0, until: 10 } }),
      ],
      mailbox: [
        { deliveryId: "d1", recipientId: "Ada", reason: "planned", state: "pending", flagged: true },
        { deliveryId: "d2", recipientId: "Bo", reason: "review_reply", state: "pending", flagged: true },
      ],
      archivedCount: 5,
      beacons: [{ ticketKey: "CH-7", agent: "Lin", text: "CH-7 needs attention" }],
    },
  );

test("every model room has a hall, and each hall's own kind maps back to it", () => {
  for (const kind of ROOM_KINDS as readonly RoomKind[]) assert.ok(HALLS.includes(hallOf(kind)), kind);
  for (const hall of HALLS) assert.equal(hallOf(HALL_KINDS[hall]), hall);
  assert.deepEqual(RACK_NAMES, { storage: "Backlog", planning: "Planning", review: "Review", dispatch: "Done" });
  assert.deepEqual(Object.values(HALL_LABELS), ["Administration", "The floor", "Lead's office"]);
});

test("places in words: the classic rooms and the three-rooms racks, floor and office", () => {
  const places: TransitPlace[] = ["storage", "planning", "review", "dispatch", "lobby", "workers", "analyst", "meeting", "lead-office", "truck"];
  assert.deepEqual(
    places.map((p) => placeWords(p)),
    ["Storage", "the planning room", "the review room", "Dispatch", "the lobby", "the workers room", "the analyst room", "the meeting room", "the lead's office", "the truck"],
  );
  assert.deepEqual(
    places.map((p) => placeWords(p, "three-rooms")),
    ["the Backlog rack", "the Planning rack", "the Review rack", "the Done rack", "Administration", "the floor", "the floor", "the huddle table", "the lead's office", "the truck"],
  );
  assert.equal(roomPlaceWords("analyst"), "in the analyst room");
  assert.equal(roomPlaceWords("analyst", "three-rooms"), "on the floor");
  assert.equal(roomPlaceWords("storage", "three-rooms"), "in Administration");
  assert.equal(roomSign("design", "three-rooms"), "The floor");
  assert.equal(roomSign("design"), "Design room");
  assert.ok(sameSign("design", "analyst", "three-rooms") && !sameSign("design", "analyst") && sameSign("review", "review"));
});

test("the three-rooms text view tells the halls' story: racks, desks, the huddle, the office", () => {
  const b = threeRoomBuilding();
  const lines = describeWorld(world([b]), undefined, { rooms: "three-rooms" });
  const section = (hall: string) => lines.filter((l) => l.section === `CH product (CH): ${hall}`).map((l) => l.text);
  const admin = section("Administration");
  assert.equal(admin[0], "Administration: Backlog 2, Planning 1, Review 1, Done 1; 2 flagged letters; 5 archived.");
  assert.match(admin.join("\n"), /CH-4 "CH-4": task as a folder, review; on the Review rack\./);
  assert.match(admin.join("\n"), /CH-1 .*on the Backlog rack\./);
  assert.match(admin.join("\n"), /Flagged letter in the mailbox for Ada/);
  const floor = section("The floor");
  assert.equal(floor[0], "The floor: Ada at its desk on CH-12 (working), Bo (idle), the analyst desk empty; a huddle at the round table about CH-12.");
  assert.ok(lines.some((l) => l.kind === "inference" && l.text === "A huddle at the round table about CH-12, inferred from recent comments and progress lines."));
  assert.match(floor.join("\n"), /CH-12 .*in progress; on Ada's desk\./);
  const office = section("Lead's office");
  assert.equal(office[0], "Lead's office: Lin (working); beacon: CH-7 needs attention.");
  assert.match(office.join("\n"), /CH-20 .*in the lead's inbox tray, no agent on it\./);
  assert.match(office.join("\n"), /CH-20 is in transit from the Planning rack to the lead's office/);
  // The building's own lines speak in halls too.
  const own = lines.filter((l) => l.section === "CH product (CH)").map((l) => l.text).join("\n");
  assert.match(own, /Ada is worker, from its name; home place on the floor, at a worker desk\./);
  assert.match(own, /Lin is lead, the project lead; home place in the lead's office\./);
  assert.match(own, /5 tickets archived from the Done rack; .* the archive counter in Administration keeps the count\./);
  // No classic room section is left.
  assert.ok(!lines.some((l) => /: (Workers room|Storage|Lobby|Meeting room)$/.test(l.section)));
});

test("the classic wording is the default and unchanged", () => {
  const b = threeRoomBuilding();
  const lines = describeWorld(world([b]));
  const text = lines.map((l) => l.text).join("\n");
  assert.deepEqual(lines, describeWorld(world([b]), undefined, { rooms: "classic" }));
  assert.match(text, /Ada is worker, from its name; home place in the Workers room\./);
  assert.match(text, /storage: 2 tickets in the pile\./);
  assert.match(text, /CH-12 .*on the desk of Ada\./);
  assert.match(text, /CH-20 is in transit from the planning room to the lead's office/);
  assert.match(text, /5 tickets archived from Dispatch; .* the lobby keeps the count\./);
  assert.ok(lines.some((l) => l.section === "CH product (CH): Storage"));
  assert.ok(!lines.some((l) => l.section === "CH product (CH): Administration"));
});

test("hallSummary takes the caller's lane words and says 'quiet' for an empty hall", () => {
  const b = threeRoomBuilding();
  assert.equal(hallSummary(b, "office", () => "stale since 12:00"), "Lead's office: Lin (stale since 12:00); beacon: CH-7 needs attention");
  const empty = building("e", [], { rooms: [room("lobby", "e"), room("lead-office", "e")] });
  assert.equal(hallSummary(empty, "floor"), "The floor: quiet");
  assert.equal(hallSummary(empty, "administration"), "Administration: Backlog 0, Planning 0, Review 0, Done 0");
});

test("where speaks in halls when asked", () => {
  const b = building("cr", [agent("cr-dev-1", { deskTicketKey: "CR-12" }), agent("cr-dev-2"), agent("boss", { role: "lead", room: "lead-office" })], {
    mailbox: [{ deliveryId: "d1", recipientId: "cr-dev-1", reason: "planned", state: "pending", flagged: false }],
  });
  const m = world([b]);
  assert.equal(where(m, "cr-dev-1"), "You are in the workers room of CR product at the CR-12 desk; nearby: cr-dev-2; the lobby has 1 letter for you.");
  assert.equal(where(m, "cr-dev-1", undefined, "three-rooms"), "You are on the floor of CR product at the CR-12 desk; nearby: cr-dev-2; Administration has 1 letter for you.");
  assert.equal(where(m, "boss", undefined, "three-rooms"), "You are in the lead's office of CR product.");
});

test("the director's sentences name the hall and the huddle in three-rooms wording", () => {
  const m = world([building("cr", [agent("idle-1"), agent("idle-2")])]);
  const go: Intent = { kind: "goToProp", agent: "idle-1", room: "review", tag: "review", ttlMs: 60_000 } as Intent;
  assert.equal(describeIntent(m, go), "idle-1 goes to the review pile in the review room");
  assert.equal(describeIntent(m, go, "three-rooms"), "idle-1 goes to the Review rack in Administration");
  const gather: Intent = { kind: "gather", agents: ["idle-1", "idle-2"], ttlMs: 60_000 } as Intent;
  assert.equal(describeIntent(m, gather), "idle-1, idle-2 gather in the meeting room");
  assert.equal(describeIntent(m, gather, "three-rooms"), "idle-1, idle-2 gather at the huddle table");
});

test("the town document's text view places a prop in its hall, naming the hosted room's zone", () => {
  const builtins: Definitions = {
    plant: { id: "plant", label: "Bird of paradise", footprint: { width: 1, depth: 1 }, blocksMovement: true, tags: ["decoration", "greenery"], approaches: [] },
  };
  const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const placed = (n: number, room: "lobby" | "analyst", cell: { x: number; z: number }): PlacedProp => ({ id: uuid(n), propId: "builtin:plant", at: { building: "crewhub", room }, cell, rotation: 0 });
  const doc = emptyTownDocument();
  doc.placements.push(placed(1, "lobby", { x: 5, z: 1 }), placed(2, "analyst", { x: 2, z: 2 }));
  const catalogue = createCatalogue(builtins, doc);
  const classic = describeTownDocument(doc, catalogue).map((l) => l.text).join("\n");
  const halls = describeTownDocument(doc, catalogue, { rooms: "three-rooms" }).map((l) => l.text).join("\n");
  assert.match(classic, /in crewhub, Lobby at cell 5,1/);
  assert.match(classic, /in crewhub, Analyst room at cell 2,2/);
  assert.match(halls, /in crewhub, Administration at cell 5,1/);
  assert.match(halls, /in crewhub, The floor \(the analyst zone\) at cell 2,2/);
});
