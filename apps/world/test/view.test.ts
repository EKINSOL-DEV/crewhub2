/* The world view's navigation (state/view.ts, round 59d C2): every intent through `stepView`, and the sentence each
   one says. Where a fact was pinned in App.tsx by hand before (the Escape chain's order, the walk's way back, the
   level following a followed figure, the keys of the stage), the test here names it. */
import assert from "node:assert/strict";
import test from "node:test";
import { emptyTownDocument, type WorldModel } from "@crewhub/world-model";
import { moveFocus, planTown } from "../src/world/townPlan.ts";
import { districtsOf, jumpEntries, HOME, type Place } from "../src/world/wayfinding.ts";
import { HOME_VIEW, hereOf, insideOf, placeOf, stepView, type View, type ViewFacts } from "../src/state/view.ts";
import { agent, building, world } from "./fixtures.ts";

const town = () => {
  const model = world([building("alpha", [agent("alpha-dev-1", "workers", { displayName: "Ada" })]), building("beta", [agent("beta-dev-1", "workers")])], {
    townHall: [agent("g-man", "lead-office", { displayName: "G-Man" })],
    postOffice: [agent("postman", "lobby", { displayName: "Postman" })],
  });
  return facts(model);
};
/** A region: two zones, two buildings each. */
const region = () => {
  const zones = [
    { id: "z1", name: "North", order: 0, color: null, emblem: null, look: {}, source: "group" as const },
    { id: "z2", name: "South", order: 1, color: null, emblem: null, look: {}, source: "group" as const },
  ];
  const model = world([{ ...building("n1"), zoneId: "z1" }, { ...building("n2"), zoneId: "z1" }, { ...building("s1"), zoneId: "z2" }, { ...building("s2"), zoneId: "z2" }], { zones });
  return facts(model);
};
function facts(model: WorldModel, rooms: ViewFacts["rooms"] = "classic"): ViewFacts & { model: WorldModel } {
  return { model, districts: districtsOf(model), plan: planTown(emptyTownDocument(), model.buildings), rooms };
}
const place = (district: string | null, building: string | null, room: Place["room"] = null): Place => ({ district, building, room });

test("enter: inside the building, its district and focus set, the selection, card and follow cleared, and the sentence", () => {
  const f = town();
  const picked: View = { ...HOME_VIEW, selection: { hover: null, selected: { kind: "agent", key: "g-man" } }, card: true, following: "g-man", room: "lobby", zoomed: "lobby" };
  const step = stepView(picked, { type: "enter", slug: "beta" }, f);
  assert.equal(step.view.entered, "beta");
  assert.equal(step.view.focused, 1);
  assert.deepEqual([step.view.room, step.view.zoomed, step.view.district], [null, null, null], "a single settlement has no district level");
  assert.deepEqual([step.view.selection.selected, step.view.card, step.view.following], [null, false, null]);
  assert.equal(step.say, "Inside beta (BETA). 2 agents here. Escape or Backspace returns to the town.");
  assert.equal(insideOf(step.view, f.model.buildings)?.slug, "beta");
  const unknown = stepView(HOME_VIEW, { type: "enter", slug: "nowhere" }, f);
  assert.equal(unknown.view, HOME_VIEW, "a building the model does not have changes nothing");
  assert.equal(unknown.handled, false);
});

test("back: out of the building; in a region to its district (Escape shows the region), in a town to the town with the focused building described", () => {
  const f = town();
  const inside = stepView(HOME_VIEW, { type: "enter", slug: "alpha" }, f).view;
  const out = stepView({ ...inside, card: true, following: "alpha-dev-1" }, { type: "back" }, f);
  assert.deepEqual([out.view.entered, out.view.card, out.view.following, out.view.focused], [null, false, null, 0]);
  assert.match(out.say!, /^The town\. alpha \(ALPHA\)\. .*Lead alpha-lead, working\. Enter to go inside\.$/);
  const r = region();
  const inS1 = stepView(HOME_VIEW, { type: "enter", slug: "s1" }, r).view;
  assert.equal(inS1.district, "z2", "a building entered carries its district");
  const step = stepView(inS1, { type: "back" }, r);
  assert.equal(step.view.district, "z2");
  assert.equal(hereOf(step.view, r.districts)?.name, "South");
  assert.match(step.say!, /^South\. .* Escape shows the region\.$/);
});

test("go: a place of any level, ending a walk there; an agent to land beside stays selected", () => {
  const r = region();
  const walking = stepView(HOME_VIEW, { type: "startWalk" }, r).view;
  assert.ok(walking.walk);
  const toRoom = stepView(walking, { type: "go", place: place("z1", "n2", "workers") }, r);
  assert.equal(toRoom.view.walk, null, "going somewhere by name ends the walk");
  assert.deepEqual([toRoom.view.entered, toRoom.view.district, toRoom.view.room, toRoom.view.zoomed, toRoom.view.focused], ["n2", "z1", "workers", "workers", 1]);
  assert.equal(toRoom.say, "Inside n2 (N2), Workers room. Escape steps back out.");
  const toDistrict = stepView(toRoom.view, { type: "go", place: place("z2", null) }, r);
  assert.deepEqual([toDistrict.view.entered, toDistrict.view.district, toDistrict.view.ringVisible], [null, "z2", false]);
  assert.match(toDistrict.say!, /^South\. .* Escape shows the region\.$/);
  const home = stepView(toDistrict.view, { type: "go", place: HOME }, r);
  assert.deepEqual(placeOf(home.view, r.districts), HOME);
  assert.equal(home.say, "The region: North, South.");
  const t = town();
  const beside = stepView(HOME_VIEW, { type: "go", place: HOME, agent: "postman" }, t);
  assert.deepEqual(beside.view.selection, { hover: null, selected: { kind: "agent", key: "postman" } });
  assert.equal(beside.say, "The town.");
});

test("jump: a town figure gets a close flight and 'Enter opens its card'; a civic building a flight; a building none", () => {
  const t = town();
  const entries = jumpEntries(t.model, t.districts);
  const postman = entries.find((e) => e.kind === "agent" && e.agent === "postman")!;
  const hall = entries.find((e) => e.kind === "civic" && e.civic === "town-hall" && !e.agent)!;
  const alpha = entries.find((e) => e.kind === "building" && e.place.building === "alpha")!;
  const a = stepView(HOME_VIEW, { type: "jump", entry: postman }, t);
  assert.deepEqual(a.view.flight, { id: 1, anchor: "a:town:postman", reach: 5 });
  assert.equal(a.say, `${postman.label}. ${postman.detail} Enter opens its card.`);
  const b = stepView(a.view, { type: "jump", entry: hall }, t);
  assert.deepEqual(b.view.flight, { id: 2, anchor: "c:town-hall" });
  assert.equal(b.say, `${hall.label}. ${hall.detail}`);
  const c = stepView(b.view, { type: "jump", entry: alpha }, t);
  assert.equal(c.view.flight.id, 2, "no flight into a building: the scene frames it");
  assert.equal(c.view.entered, "alpha");
  const likely = stepView(c.view, { type: "jumpActive", building: "beta" }, t);
  assert.equal(likely.view.likely, "beta");
  assert.equal(stepView(likely.view, { type: "jumpActive", building: "beta" }, t).view, likely.view, "the same row again changes nothing");
});

test("the Escape chain closes the innermost thing first: walk, build mode, text view, follow, card, selection, zoomed room, building, district, nothing", () => {
  const r = region();
  const open = { text: true, build: true };
  const everything: View = {
    ...stepView(HOME_VIEW, { type: "go", place: place("z1", "n1", "workers") }, r).view,
    selection: { hover: null, selected: { kind: "agent", key: "n1-lead" } },
    card: true,
    following: "n1-lead",
  };
  // A walk is the innermost of all (it took the camera, so no follow, card or selection stands with it).
  const walking = stepView(stepView(everything, { type: "startWalk" }, r).view, { type: "escape", open }, r);
  assert.deepEqual([walking.view.walk, walking.say, walking.close], [null, "Walking stopped.", null]);
  const order: string[] = [];
  let view = everything;
  for (let i = 0; i < 12; i++) {
    const step = stepView(view, { type: "escape", open: { text: open.text, build: open.build } }, r);
    if (step.close === "build") open.build = false;
    if (step.close === "text") open.text = false;
    if (!step.handled) {
      order.push("nothing");
      break;
    }
    order.push(step.close ?? (view.following !== step.view.following ? "follow" : view.card !== step.view.card ? "card" : view.selection.selected !== step.view.selection.selected ? "selection" : view.zoomed !== step.view.zoomed ? "zoomed" : view.entered !== step.view.entered ? "building" : view.district !== step.view.district ? "district" : "?"));
    view = step.view;
  }
  assert.deepEqual(order, ["build", "text", "follow", "card", "selection", "zoomed", "building", "district", "nothing"]);
  assert.deepEqual(placeOf(view, r.districts), HOME);
  // The sentences along the way.
  const zoomed = stepView({ ...everything, selection: { hover: null, selected: null }, card: false, following: null }, { type: "escape", open: { text: false, build: false } }, r);
  assert.equal(zoomed.say, "Inside n1. Arrow keys move between rooms.");
  const halls = stepView(zoomed.view, { type: "escape", open: { text: false, build: false } }, facts(r.model, "three-rooms"));
  assert.match(halls.say!, /Escape shows the region\.$/);
  assert.equal(stepView({ ...zoomed.view, entered: null, zoomed: null, room: null }, { type: "escape", open: { text: false, build: false } }, r).say, "The region: North, South.");
});

test("the walk keeps its return point once: Escape brings the view back to the level it began on, or to the town when that building is gone", () => {
  const t = town();
  const inside = stepView(stepView(HOME_VIEW, { type: "enter", slug: "beta" }, t).view, { type: "focusRoom", kind: "workers", zoom: true }, t).view;
  const start = stepView({ ...inside, following: "beta-dev-1", card: true, ringVisible: true }, { type: "startWalk" }, t);
  assert.deepEqual(start.view.walk, { entered: "beta", room: "workers", zoomed: "workers", district: null });
  assert.deepEqual([start.view.following, start.view.card, start.view.ringVisible, start.view.selection.selected], [null, false, false, null], "a walk takes the camera: the follow ends, the card closes");
  assert.match(start.say!, /^Walking\. W A S D/);
  // The walk goes out of the door and into the other building: the level follows (as a click would).
  const out = stepView(start.view, { type: "back" }, t).view;
  const into = stepView(out, { type: "enter", slug: "alpha" }, t).view;
  assert.deepEqual([into.entered, into.walk?.entered], ["alpha", "beta"], "entering on foot keeps the walk and its return point");
  const stopped = stepView(into, { type: "stopWalk" }, t);
  assert.deepEqual([stopped.view.entered, stopped.view.room, stopped.view.zoomed, stopped.view.walk], ["beta", "workers", "workers", null]);
  assert.equal(stopped.say, "Walking stopped.");
  const gone = facts(world([t.model.buildings[0]!]));
  const toTown = stepView(into, { type: "stopWalk" }, gone);
  assert.deepEqual([toTown.view.entered, toTown.view.room], [null, "workers"], "the building left the town: the town, the room kept as it was");
});

test("follow: the sentence names the agent; the followed figure moves the level and keeps the selection and the card", () => {
  const t = town();
  const selected: View = { ...HOME_VIEW, selection: { hover: null, selected: { kind: "agent", key: "alpha-dev-1" } }, card: true };
  const on = stepView(selected, { type: "follow", key: "alpha-dev-1" }, t);
  assert.equal(on.say, "Following Ada. Escape, Shift+F or a drag stops following.");
  const arrived = stepView(on.view, { type: "followed", building: "alpha" }, t);
  assert.deepEqual([arrived.view.entered, arrived.view.focused, arrived.view.card, arrived.view.selection.selected?.kind], ["alpha", 0, true, "agent"]);
  assert.equal(arrived.say, "Ada walked into alpha (ALPHA).");
  const left = stepView(arrived.view, { type: "followed", building: null }, t);
  assert.equal(left.view.entered, null);
  assert.equal(left.say, "Ada is walking through the town.");
  const stopped = stepView(left.view, { type: "followStopped" }, t);
  assert.deepEqual([stopped.view.following, stopped.say], [null, "Stopped following."]);
  assert.equal(stepView(stopped.view, { type: "followed", building: "alpha" }, t).say, "", "a figure arriving after the follow ended says nothing (clears the region)");
  assert.equal(stepView(on.view, { type: "follow", key: null }, t).say, "Stopped following.");
});

test("pick: a prop is no pick, hover keeps the selection, an agent clicked opens its card, the same thing clicked again clears, a room zooms", () => {
  const t = town();
  const inside = stepView(HOME_VIEW, { type: "enter", slug: "alpha" }, t).view;
  const hover = stepView(inside, { type: "pick", target: { kind: "agent", key: "alpha-dev-1" }, hover: true }, t).view;
  assert.deepEqual(hover.selection, { hover: { kind: "agent", key: "alpha-dev-1" }, selected: null });
  const clicked = stepView(hover, { type: "pick", target: { kind: "agent", key: "alpha-dev-1" }, hover: false }, t).view;
  assert.deepEqual([clicked.selection.selected, clicked.card, clicked.selection.hover?.kind], [{ kind: "agent", key: "alpha-dev-1" }, true, "agent"]);
  const object = stepView(clicked, { type: "pick", target: { kind: "object", ticketId: "t1" }, hover: false }, t).view;
  assert.deepEqual([object.selection.selected, object.card], [{ kind: "object", ticketId: "t1" }, false]);
  const again = stepView(object, { type: "pick", target: { kind: "object", ticketId: "t1" }, hover: false }, t).view;
  assert.equal(again.selection.selected, null, "the selected object clicked again clears");
  const prop = stepView(clicked, { type: "pick", target: { kind: "prop", id: "p" }, hover: false }, t).view;
  assert.deepEqual([prop.selection.selected, prop.card], [null, false], "a prop clicked is a click elsewhere");
  const room = stepView(inside, { type: "pick", target: { kind: "room", room: "workers" }, hover: false }, t);
  assert.deepEqual([room.view.room, room.view.zoomed], ["workers", "workers"]);
  assert.equal(room.say, "Zoomed to the workers: Ada working. Escape goes back to the building.");
  const focus = stepView(inside, { type: "focusRoom", kind: "lobby", zoom: false }, t);
  assert.deepEqual([focus.view.room, focus.view.zoomed], ["lobby", null]);
  assert.equal(focus.say, "lobby: quiet.");
});

test("the stage's keys in the town: the arrows show and move the ring and describe, Enter enters the focused building or opens a selected figure's card", () => {
  const t = town();
  const first = stepView(HOME_VIEW, { type: "key", key: "ArrowRight", onCanvas: true }, t);
  assert.deepEqual([first.view.focused, first.view.ringVisible, first.handled], [0, true, true], "the first arrow shows the ring where it is");
  assert.match(first.say!, /^alpha \(ALPHA\)\./);
  const moved = stepView(first.view, { type: "key", key: "End", onCanvas: true }, t);
  assert.equal(moved.view.focused, moveFocus(t.plan, ["alpha", "beta"], 0, "End"), "the ring moves by where the buildings stand");
  const entered = stepView(moved.view, { type: "key", key: "Enter", onCanvas: true }, t);
  assert.equal(entered.view.entered, t.model.buildings[moved.view.focused]!.slug);
  const offCanvas = stepView(moved.view, { type: "key", key: "Enter", onCanvas: false }, t);
  assert.equal(offCanvas.handled, false, "Enter on a label is the label's");
  const figure: View = { ...HOME_VIEW, selection: { hover: null, selected: { kind: "agent", key: "postman" } } };
  const card = stepView(figure, { type: "key", key: "Enter", onCanvas: true }, t);
  assert.deepEqual([card.view.card, card.view.entered], [true, null]);
  assert.equal(stepView(HOME_VIEW, { type: "key", key: "x", onCanvas: true }, t).handled, false);
  const hovered = stepView(HOME_VIEW, { type: "hover", index: 1 }, t);
  assert.deepEqual([hovered.view.focused, hovered.view.ringVisible, hovered.say], [1, true, null]);
  assert.equal(stepView(HOME_VIEW, { type: "hover", index: null }, t).view, HOME_VIEW);
  assert.equal(stepView(hovered.view, { type: "hover", index: 1 }, t).view, hovered.view, "the same building again is the same view: no render (review-c2 N3)");
});

test("the stage's keys inside: the arrows move the room focus from the lobby, Enter zooms to the focused room or opens a selected agent's card", () => {
  const t = town();
  const inside = stepView(HOME_VIEW, { type: "enter", slug: "alpha" }, t).view;
  const first = stepView(inside, { type: "key", key: "ArrowUp", onCanvas: false }, t);
  assert.equal(first.view.room, "lobby", "the first arrow lands on the lobby");
  assert.equal(first.view.zoomed, null);
  const next = stepView(first.view, { type: "key", key: "ArrowUp", onCanvas: false }, t);
  assert.notEqual(next.view.room, "lobby");
  const zoom = stepView(next.view, { type: "key", key: "Enter", onCanvas: true }, t);
  assert.equal(zoom.view.zoomed, next.view.room);
  const selected = stepView(inside, { type: "pick", target: { kind: "agent", key: "alpha-dev-1" }, hover: false }, t).view;
  const closed = stepView(selected, { type: "closeCard" }, t).view;
  assert.equal(closed.card, false);
  const card = stepView(closed, { type: "key", key: "Enter", onCanvas: true }, t);
  assert.deepEqual([card.view.card, card.view.zoomed], [true, null]);
  assert.equal(stepView(inside, { type: "key", key: "Home", onCanvas: true }, t).handled, false, "Home is the town's key");
});

test("camera commands count up so the scene runs each once; settle drops a district level that is no longer in use", () => {
  const r = region();
  const a = stepView(HOME_VIEW, { type: "camera", action: "zoom-in" }, r).view;
  const b = stepView(a, { type: "camera", action: "zoom-in" }, r).view;
  assert.deepEqual([a.action, b.action], [{ id: 1, type: "zoom-in" }, { id: 2, type: "zoom-in" }]);
  const inDistrict = stepView(HOME_VIEW, { type: "go", place: place("z2", null) }, r).view;
  assert.equal(stepView(inDistrict, { type: "settle" }, r).view, inDistrict, "still in use: unchanged");
  const shrunk = facts(world(r.model.buildings.filter((x) => x.zoneId === "z1"), { zones: r.model.zones }));
  assert.equal(stepView(inDistrict, { type: "settle" }, shrunk).view.district, null);
});
