/**
 * Design choice W17 (`why`, walkthrough w1-13): a boarded-up building's text keeps loops' own ticket count ("Tickets:
 * 2 backlog, …", which the archive keeps) and says why its racks hold nothing: the Administration line reads "the racks
 * are boarded up; the tickets are archived with the project" in place of the four zero counts. The floor and the
 * office keep their lines; a live building's Administration line is as before.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { describeWorld, hallSummary } from "../src/describe.ts";
import { building, object, world } from "./fixtures.ts";

const BOARDED = "Administration: the racks are boarded up; the tickets are archived with the project";

const archived = () =>
  building("ops", [], {
    archived: true,
    archivedAt: "2026-10-01T07:44:00Z",
    archivedBy: "Nicky",
    counts: { backlog: 2, planned: 1, in_progress: 0, review: 0, done: 1 },
  });

test("W17: a boarded-up building's Administration line says why the racks are empty", () => {
  assert.equal(hallSummary(archived(), "administration"), BOARDED);
  assert.equal(hallSummary(archived(), "floor"), "The floor: quiet");
  assert.equal(hallSummary(archived(), "office"), "Lead's office: quiet");
});

test("W17: the text view keeps loops' Tickets line and says why the racks are empty, four lines apart", () => {
  const lines = describeWorld(world([archived()]), undefined, { rooms: "three-rooms" });
  const own = lines.filter((l) => l.section === "OPS product (OPS)").map((l) => l.text);
  assert.ok(own.some((t) => t.startsWith("Tickets: 2 backlog, 1 planned, 0 in progress, 0 review, 1 done")), own.join("\n"));
  const admin = lines.filter((l) => l.section === "OPS product (OPS): Administration").map((l) => l.text);
  assert.equal(admin[0], `${BOARDED}.`);
  assert.ok(!admin.some((t) => /Backlog 0, Planning 0, Review 0, Done 0/.test(t)), admin.join("\n"));
});

test("W17: a live building's Administration line is as before", () => {
  const live = building("cr", [], { objects: [object("CR-1", { status: "backlog", room: "storage" }), object("CR-2", { status: "review", room: "review" })], archivedCount: 3 });
  assert.equal(hallSummary(live, "administration"), "Administration: Backlog 1, Planning 0, Review 1, Done 0; 3 archived");
});
