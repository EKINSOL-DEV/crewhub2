/**
 * Design choice W17 (`why`, walkthrough w1-13): the room focus status line of a boarded-up building's Administration
 * follows the text view's hall sentence: it says why the racks are empty, not four zero counts. The floor's and the
 * office's lines, and the classic wording, are as before.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentPlacement, Building } from "@crewhub/world-model";
import { roomSummary, zoomedTo } from "../src/world/roomWords.ts";
import { building } from "./fixtures.ts";

const lane = (a: AgentPlacement) => (a.laneStatus === "unknown" ? "status unknown" : a.laneStatus);
const BOARDED = "Administration: the racks are boarded up; the tickets are archived with the project.";

function boarded(): Building {
  const b = building("ops", [], [], ["storage", "planning", "dispatch"]);
  b.archived = true;
  b.archivedAt = "2026-10-01T07:44:00Z";
  b.counts = { backlog: 2, planned: 1, in_progress: 0, review: 0, done: 1 };
  return b;
}

test("W17: the status line of a boarded-up building's Administration says why the racks are empty", () => {
  const b = boarded();
  assert.equal(roomSummary(b, "storage", lane, "three-rooms"), BOARDED);
  assert.equal(roomSummary(b, "review", lane, "three-rooms"), BOARDED);
  assert.equal(zoomedTo(roomSummary(b, "storage", lane, "three-rooms"), "storage", "three-rooms"), `Zoomed to ${BOARDED}`);
  assert.equal(roomSummary(b, "workers", lane, "three-rooms"), "The floor: quiet.");
  assert.equal(roomSummary(b, "lead-office", lane, "three-rooms"), "Lead's office: ops-lead (working).", "the fixture seats the lead; the office line is as before");
  assert.doesNotMatch(roomSummary(b, "storage", lane), /boarded up/, "the classic wording is not W17's");
});
