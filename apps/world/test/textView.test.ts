/* The text view's order and wording, through its one interface (`world/textView.ts`): which lines, in which order, and
   where each section lands. The rendering over this structure is the regress's and the a11y run's. */
import assert from "node:assert/strict";
import test from "node:test";
import type { CastManifest } from "@crewhub/world-cast";
import { applyEdit, CIVIC_WORDS, createCatalogue, describeWorld, emptyTownDocument, type TextLine, type WorldModel, type Zone } from "@crewhub/world-model";
import { allocationEdit } from "../src/world/settlement.ts";
import { planTown } from "../src/world/townPlan.ts";
import { textViewLines, textViewSections, type TextViewFacts } from "../src/world/textView.ts";
import { districtsOf } from "../src/world/wayfinding.ts";
import { agent, building, world } from "./fixtures.ts";

const casts = {
  listCasts: () => [{ id: "sprouts", name: "Sprouts" } as CastManifest],
  resolve: () => ({ id: "sprouts", unknown: [] }),
};

function facts(model: WorldModel, extra: Partial<TextViewFacts> = {}): TextViewFacts {
  const doc = emptyTownDocument();
  return {
    model,
    text: [{ section: "Town", text: "The source's own words.", kind: "fact" }],
    civic: CIVIC_WORDS,
    rooms: "classic",
    viewerCast: null,
    styleCast: "sprouts",
    casts,
    town: { doc, catalogue: createCatalogue({}, doc), invalid: [], storage: "memory", storageNote: null },
    rules: [],
    plan: planTown(doc, model.buildings),
    said: new Map(),
    nowMs: 0,
    ...extra,
  };
}

const zone = (id: string, name: string, extra: Partial<Zone> = {}): Zone => ({ id, name, order: 0, color: null, emblem: null, look: {}, source: "town", ...extra });

test("textViewLines keeps the order: the world, what is said, casts, zones, the plan, the town document, its keeping", () => {
  const model = world([building("inbox")], { mode: "live", zones: [zone("studio", "Studio")] });
  const said = new Map([["inbox-lead", { text: "Done.", agentName: "inbox-lead", messageId: "m", threadId: "t", shownAt: 0, until: 1000 }]]);
  const lines = textViewLines(facts(model, { rooms: "three-rooms", said, town: { ...facts(model).town, storageNote: "A note about the store." } }));

  const firstOf = (match: (line: TextLine) => boolean) => lines.findIndex(match);
  const order = [
    firstOf((l) => l.section === "Town"),
    firstOf((l) => l.text.startsWith("inbox-lead says: Done.")),
    firstOf((l) => l.text.startsWith("Cast: ")),
    firstOf((l) => l.section === "Zones"),
    firstOf((l) => l.section === "Town layout"),
    firstOf((l) => l.section === "Build"),
    firstOf((l) => l.text.startsWith("The town document is ")),
    firstOf((l) => l.text === "A note about the store."),
  ];
  assert.ok(order.every((i) => i >= 0), `every part is there: ${order.join(", ")}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), `in order: ${order.join(", ")}`);
});

test("textViewLines takes the source's own words only for the default civic names in the classic rooms", () => {
  const model = world([building("inbox")]);
  const own = (extra: Partial<TextViewFacts>) => textViewLines(facts(model, extra)).some((l) => l.text === "The source's own words.");
  assert.equal(own({}), true);
  assert.equal(own({ rooms: "three-rooms" }), false);
  assert.equal(own({ civic: { ...CIVIC_WORDS, hall: "lodge" } }), false);
  assert.equal(own({ civic: { ...CIVIC_WORDS, post: "mailbox" } }), false);

  const described = textViewLines(facts(model, { civic: { hall: "lodge", post: "mailbox" }, rooms: "three-rooms" }));
  for (const line of describeWorld(model, { hall: "lodge", post: "mailbox" }, { rooms: "three-rooms" })) assert.ok(described.some((l) => l.text === line.text), line.text);
});

test("textViewLines says where a live town document is kept, lower-cased into one sentence; a demo town says nothing", () => {
  const keeping = (mode: "demo" | "live", storage: TextViewFacts["town"]["storage"]) => {
    const model = world([building("inbox")], { mode });
    return textViewLines(facts(model, { town: { ...facts(model).town, storage } })).filter((l) => l.text.startsWith("The town document is "));
  };
  assert.deepEqual(keeping("live", "host"), [{ section: "Town document", text: "The town document is kept by the world's host for this crewhub-loops, shared by every paired browser.", kind: "fact" }]);
  // A prefix: this test owns the lower-casing into a sentence, `townKeepingWords` owns the words after it (q8's answer adds a rule there).
  assert.match(keeping("live", "indexeddb")[0]!.text, /^The town document is kept in this browser until the host is back\./);
  assert.deepEqual(keeping("demo", "indexeddb"), []);
});

test("textViewLines says the store's note as a fact of the town document, and nothing without one", () => {
  const model = world([building("inbox")]);
  const note = textViewLines(facts(model, { town: { ...facts(model).town, storageNote: "Kept in memory only." } })).filter((l) => l.text === "Kept in memory only.");
  assert.deepEqual(note, [{ section: "Town document", text: "Kept in memory only.", kind: "fact" }]);
});

test("textViewLines names a zone's look from its options and its cast, and a cast nobody registered by its id", () => {
  const model = world([building("inbox")], {
    zones: [
      zone("studio", "Studio", { look: { styleOptions: { season: "autumn" }, castId: "sprouts" } }),
      zone("yard", "Yard", { look: { castId: "gone-cast" } }),
    ],
  });
  const zones = textViewLines(facts(model)).filter((l) => l.section === "Zones").map((l) => l.text);
  assert.match(zones[0]!, /^Studio .* Look: autumn, Sprouts\.$/);
  assert.match(zones[1]!, /^Yard .* Look: gone-cast\.$/);
});

test("textViewLines names an archived building in the plan by its name, a lot without a building by its slug", () => {
  const buildings = [{ ...building("other") }, { ...building("inbox"), name: "The Inbox", archived: true, archivedAt: "2026-01-01T00:00:00Z" }];
  const edit = allocationEdit(emptyTownDocument(), buildings);
  assert.ok(edit);
  const applied = applyEdit(emptyTownDocument(), edit, { knownStyles: ["greenhouse"], builtinIds: [] });
  assert.ok(applied.ok);
  const plan = planTown(applied.doc, buildings);
  const archivedLine = (model: WorldModel) => textViewLines(facts(model, { plan })).filter((l) => l.section === "Town layout" && l.text.startsWith("Archived"));
  assert.match(archivedLine(world(buildings))[0]!.text, /: The Inbox\.$/);
  assert.match(archivedLine(world(buildings.slice(0, 1)))[0]!.text, /: inbox\.$/);
});

test("textViewLines reads the clock it is given: a said line in flight at nowMs, gone once it ended", () => {
  const model = world([building("inbox", [agent("dev", "planning", { displayName: "Dev" })])]);
  const said = new Map([["dev", { text: "Hello.", agentName: "dev", messageId: "m", threadId: "t", shownAt: 0, until: 1000 }]]);
  const shown = (nowMs: number) => textViewLines(facts(model, { said, nowMs })).filter((l) => l.text.startsWith("Dev says: Hello."));
  assert.equal(shown(999).length, 1);
  assert.equal(shown(1000).length, 0);
});

const twoDistricts = () => {
  const inbox = { ...building("inbox"), name: "Inbox", zoneId: "studio" };
  const lab = { ...building("lab"), name: "Lab", zoneId: "yard" };
  return { inbox, lab, districts: districtsOf({ zones: [zone("studio", "Studio", { order: 0 }), zone("yard", "Yard", { order: 1 })], buildings: [inbox, lab] }) };
};
const line = (section: string, text = section): TextLine => ({ section, text, kind: "fact" });

test("textViewSections: the town before, a building's two sections under its district, the rest after", () => {
  const { districts } = twoDistricts();
  const view = textViewSections(
    [line("Zones"), line("Lab (LAB)"), line("Town", "first"), line("Inbox (INBOX): Lobby"), line("Town layout"), line("Inbox (INBOX)"), line("Town", "second"), line("Town document")],
    districts,
  );
  assert.deepEqual(view.before.map((s) => [s.name, s.lines.map((l) => l.text)]), [["Town", ["first", "second"]]]);
  assert.deepEqual(
    view.districts.map((d) => [d.district.name, d.buildings.map((b) => [b.building.name, b.sections.map((s) => s.name)])]),
    [
      ["Studio", [["Inbox", ["Inbox (INBOX): Lobby", "Inbox (INBOX)"]]]],
      ["Yard", [["Lab", ["Lab (LAB)"]]]],
    ],
  );
  assert.deepEqual(view.after.map((s) => s.name), ["Zones", "Town layout", "Town document"]);
});

test("textViewSections: a building's name that merely starts the same owns nothing of the other's", () => {
  const inbox = { ...building("inbox"), name: "Inbox" };
  const inbox2 = { ...building("inbox2"), name: "Inbox 2" };
  const view = textViewSections([line("Inbox (INBOX): Lobby"), line("Inbox 2 (INBOX2): Lobby"), line("Inbox (INBOX)x")], districtsOf({ zones: world([]).zones, buildings: [inbox, inbox2] }));
  const owned = view.districts.flatMap((d) => d.buildings.map((b) => [b.building.slug, b.sections.map((s) => s.name)]));
  assert.deepEqual(owned, [["inbox", ["Inbox (INBOX): Lobby"]], ["inbox2", ["Inbox 2 (INBOX2): Lobby"]]]);
  assert.deepEqual(view.after.map((s) => s.name), ["Inbox (INBOX)x"]);
});

test("textViewSections: a building with no section of its own still stands in its district, with none", () => {
  const { districts } = twoDistricts();
  const view = textViewSections([line("Inbox (INBOX)")], districts);
  assert.deepEqual(view.districts.map((d) => d.buildings.map((b) => [b.building.slug, b.sections.length])), [[["inbox", 1]], [["lab", 0]]]);
});

test("nothing is lost between the lines and the sections: every line of a whole town lands exactly once, in its order", () => {
  const inbox = { ...building("inbox", [agent("dev", "planning", { displayName: "Dev" })]), zoneId: "studio" };
  const lab = { ...building("lab"), zoneId: "yard" };
  const model = world([inbox, lab], { mode: "live", zones: [zone("studio", "Studio", { order: 0 }), zone("yard", "Yard", { order: 1 })] });
  const lines = textViewLines(facts(model, { rooms: "three-rooms", town: { ...facts(model).town, storageNote: "A note." } }));
  const view = textViewSections(lines, districtsOf(model));
  const sections = [...view.before, ...view.districts.flatMap((d) => d.buildings.flatMap((b) => b.sections)), ...view.after];
  assert.ok(view.districts.flatMap((d) => d.buildings).every((b) => b.sections.length > 1), "the rich model gives each building more than one section");
  assert.equal(sections.reduce((n, s) => n + s.lines.length, 0), lines.length);
  for (const section of sections) assert.deepEqual(section.lines, lines.filter((l) => l.section === section.name));
  assert.equal(new Set(sections.map((s) => s.name)).size, sections.length, "no section twice");
});

test("textViewLines hands every fact to its producer: a fact dropped on the way would change what is said", () => {
  const model = world([building("inbox", [agent("dev", "planning", { displayName: "Dev" })])], { mode: "live", zones: [zone("studio", "Studio")] });
  const town = facts(model).town;
  const section = (extra: Partial<TextViewFacts>, name: string) => textViewLines(facts(model, extra)).filter((l) => l.section === name).map((l) => l.text);

  const rule = { id: "r", rule: "release", key: "banner", anchor: {}, count: null, text: "A rule's sentence." } as unknown as TextViewFacts["rules"][number];
  assert.deepEqual(section({ rules: [rule] }, "Build: rule props"), ["A rule's sentence."]);
  const invalid = [{ ticketKey: "T-1", slug: "inbox", error: "bad prop", room: "planning" }] as unknown as TextViewFacts["town"]["invalid"];
  assert.deepEqual(section({ town: { ...town, invalid } }, "Build: prop requests"), ["Error object in inbox: bad prop."]);
  assert.notDeepEqual(section({ town: { ...town, storage: "host" } }, "Zones"), section({ town: { ...town, storage: "indexeddb" } }, "Zones"), "the zones line says who keeps the town");

  const said = new Map([["dev", { text: "Hello.", agentName: "dev", messageId: "m", threadId: "t", shownAt: 0, until: 1000 }]]);
  const says = (rooms: TextViewFacts["rooms"]) => textViewLines(facts(model, { said, rooms })).filter((l) => l.text.startsWith("Dev says: Hello."));
  assert.notDeepEqual(says("classic"), says("three-rooms"), "a said line names the room in the rooms' own words");
  const placed = { ...town.doc, placements: [{ id: "p", propId: "builtin:desk", at: { building: "inbox", room: "analyst" }, cell: { x: 0, z: 0 }, rotation: 0 }] } as unknown as TextViewFacts["town"]["doc"];
  const place = (rooms: TextViewFacts["rooms"]) => section({ rooms, town: { ...town, doc: placed } }, "Build: placed props");
  assert.notDeepEqual(place("classic"), place("three-rooms"), "a placed prop names its room in the rooms' own words");

  const asked: { viewer?: unknown; style?: unknown }[] = [];
  textViewLines(facts(model, { viewerCast: "mine", styleCast: "the-style", casts: { ...casts, resolve: (order: { viewer?: unknown; style?: unknown }) => (asked.push(order), casts.resolve()) } as never }));
  assert.ok(asked.length > 0 && asked.every((o) => o.viewer === "mine" && o.style === "the-style"), "the cast lines ask with the viewer's choice and the style's default");
  assert.deepEqual(section({ town: { ...town, storageNote: "" } }, "Town document").filter((t) => t === ""), [], "an empty note says nothing");
});

/* Round 62's mutation run: what the rows above left open. */
test("textViewLines hands the casts and the zones the town's own facts: its cast, its plots, the zones and where each building stands", () => {
  // A registry that answers by the look's order, so a fact not handed on changes what is said.
  type Order = { building?: string; zone?: string; viewer?: string | null; town?: string | null; style?: string | null };
  const honest = { listCasts: () => [] as CastManifest[], resolve: (o: Order) => ({ id: o.building ?? o.zone ?? o.viewer ?? o.town ?? o.style ?? "none", unknown: [] }) } as unknown as TextViewFacts["casts"];
  const inbox = { ...building("inbox"), zoneId: "studio" };
  const lab = { ...building("lab"), zoneId: "studio" };
  const model = world([inbox, lab], { zones: [zone("studio", "Studio", { look: { castId: "zoned" } }), zone("yard", "Yard", { order: 1 })] });
  const town = facts(model).town;
  const doc: TextViewFacts["town"]["doc"] = {
    ...town.doc,
    castId: "the-town",
    plots: [
      { slug: "inbox", cell: { x: 64, z: 64 }, zoneId: "studio", castId: "zoned" },
      { slug: "lab", cell: { x: 66, z: 64 }, zoneId: "yard", castId: "its-own" },
    ],
  };
  const said = textViewLines(facts(model, { casts: honest, styleCast: null, town: { ...town, doc } })).map((l) => l.text);

  assert.ok(said.includes("Cast: the-town."), "the town's cast");
  assert.ok(said.includes("Cast of the Studio zone: zoned."), "the zone's cast");
  assert.ok(said.includes("Cast of lab: its-own."), "a plot's cast");
  assert.ok(!said.includes("Cast of inbox: zoned."), "a plot that wears what its zone wears, found by its building, is not news");
  assert.ok(said.some((t) => t.startsWith("Studio ") && t.includes(": inbox, lab.")), "the zone's line names its buildings");
  assert.ok(said.includes('lab belongs to Studio but stands in the district of Yard; "Tidy the town" or a move in build mode rehouses it.'), "a plot's district against its building's zone");
});

test("textViewLines says the civic places of a said line in the town's own words", () => {
  const model = world([], { townHall: [agent("clerk", "lead-office")], postOffice: [agent("postie", "lead-office")] });
  const line = { text: "Hello.", agentName: null, messageId: "m", threadId: "t", shownAt: 0, until: 1000 };
  const said = new Map([["clerk", line], ["postie", { ...line, messageId: "n" }]]);
  const text = textViewLines(facts(model, { said, civic: { hall: "lodge", post: "mailbox" } })).map((l) => l.text);
  assert.ok(text.includes("clerk says: Hello. (at the lodge)"), text.join(" | "));
  assert.ok(text.includes("postie says: Hello. (at the mailbox)"), text.join(" | "));
});
