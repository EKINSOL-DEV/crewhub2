/* Round 34: the prop a ticket brings, under fuzz. The text comes from loops: a comment's Markdown (or rich body) with a
   fenced json block, the ticket's title and body with a `place:` line. `jsonBlocks`, `richJsonBlocks` and
   `extractPropRequest` read them (world-model, propRequests.ts); `importPropRequest` puts the prop in the town over the
   demo's own model. Seeded, a few thousand inputs: fences of every spelling with odd text around them, broken copies
   of a valid prop inside, rich bodies of any shape and depth, titles and place lines of odd unicode. What a caller
   sees: never a throw; a prop that comes out validates and carries the ticket as provenance; a town that comes out
   validates; a refusal is one readable line. */
import assert from "node:assert/strict";
import test from "node:test";
import { SCRIPT_DURATION_MS, createDemoSource, createManualScheduler } from "@crewhub/demo";
import type { CommentOut } from "@crewhub/loops-client";
import { PROP_MATERIALS, validatePropModel } from "@crewhub/world-engine";
import { ROOM_KINDS, Projection, builtinIds, emptyMemory, emptyTownDocument, extractPropRequest, jsonBlocks, placeFor, reduceWorld, richJsonBlocks, validateTownDocument, type PropTicket, type WorldModel } from "@crewhub/world-model";
import { definitions } from "../src/world/definitions.ts";
import { importPropRequest } from "../src/world/propImport.ts";
import { Fuzz, ODD_STRINGS, protoSnapshot, replay } from "../../../packages/world-engine/test/fuzz.ts";

const SEEDS = [34_021, 34_022, 34_023];
const PROP = {
  format: "crewhub-prop/1",
  id: "user:fuzz-fern",
  name: "Fuzz fern",
  description: "A fern.",
  category: "greenery",
  tags: ["fern"],
  footprint: { width: 1, depth: 1 },
  blocksMovement: false,
  approaches: [{ x: 0, z: -1 }],
  parts: [{ shape: "cylinder", size: [0.2, 0.5, 0.2], position: [0, 0.25, 0], material: PROP_MATERIALS[0] }],
};
const comment = (bodyMarkdown: string | null, extra: Partial<CommentOut> = {}): CommentOut =>
  ({ id: "c1", ticketId: "tk_1", rootId: "c1", author: { id: "cr-dev-1", kind: "agent", displayName: "Dev" }, kind: "comment", createdAt: "2026-10-23T04:00:00Z", bodyMarkdown, ...extra }) as CommentOut;
const ticket = (patch: Partial<PropTicket> = {}): PropTicket => ({ key: "CR-77", title: "Prop: a fern for the lobby", labels: [{ name: "prop" }], bodyMarkdown: "place: lobby", body: null, project: { slug: "crewhub" }, ...patch }) as PropTicket;

/** The demo's world, reduced once, for the places a prop can go. */
async function demoModel(): Promise<WorldModel> {
  const scheduler = createManualScheduler(1_000);
  const source = createDemoSource({ scheduler, speed: 16 });
  const projection = new Projection(source, { coalesceMs: 0 });
  source.start((message) => projection.apply(message));
  scheduler.advance(Math.ceil((SCRIPT_DURATION_MS - 5_000) / 16));
  await new Promise((resolve) => setTimeout(resolve, 10));
  return reduceWorld(projection.facts, emptyMemory(), { now: source.now(), mode: "demo", roleOverrides: {} }).model;
}

test("round 34 fuzz: fenced json blocks of every spelling, with odd text around and inside, are found or not, never thrown on; the last block decides", () => {
  const before = protoSnapshot();
  const json = JSON.stringify(PROP);
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 300; i += 1) {
      const fence = f.pick(["```", "````", "~~~", "~~~~", "```", "``", "~~", "```` ", " ```", "   ```", "    ```"]);
      const lang = f.pick(["json", "JSON", "Json", " json ", "json5", "", "js", "json\t"]);
      const nl = f.pick(["\n", "\r\n"]);
      const inner = f.bool(0.6) ? json : f.jsonText(f.bool() ? PROP : f.mutate(PROP, f.int(1, 3)));
      const close = f.bool(0.85) ? fence.trim() : "";
      const markdown = [f.string(40), `${fence}${lang}`, inner, close, f.string(40), ...(f.bool(0.3) ? ["```json", f.jsonText(f.value(2)), "```"] : [])].join(nl);
      let blocks: string[];
      try {
        blocks = jsonBlocks(markdown);
      } catch (error) {
        assert.fail(`${replay(seed, i, markdown)} threw ${String(error)}`);
      }
      assert.ok(Array.isArray(blocks) && blocks.every((b) => typeof b === "string"), replay(seed, i));
      const extracted = extractPropRequest(ticket(), [comment(markdown)]);
      if (extracted.ok) {
        assert.ok(validatePropModel(extracted.prop).ok, replay(seed, i));
        assert.deepEqual(extracted.prop.provenance, { kind: "ticket", ticketKey: "CR-77" }, replay(seed, i));
      } else assert.match(extracted.error, /^prop CR-77 (is not valid JSON|is invalid|has no json block)/, replay(seed, i, extracted.error));
    }
  }
  // The spellings CommonMark opens a fence with, around a whole prop: each is read.
  for (const [open, close] of [["```json", "```"], ["~~~json", "~~~"], ["````JSON", "````"], ["   ```json  ", "   ```"], ["```json", ""]])
    assert.ok(extractPropRequest(ticket(), [comment(close === "" ? `before\r\n${open}\r\n${json}` : `before\r\n${open}\r\n${json}\r\n${close}\r\nafter`)]).ok, `${JSON.stringify(open)} … ${JSON.stringify(close)}`);
  // Not a fence: fewer than three marks, four leading spaces (a code block by indentation), a language that is not json.
  for (const open of ["``json", "    ```json", "```js", "```jsonc"]) assert.ok(!extractPropRequest(ticket(), [comment(`${open}\n${json}\n\`\`\``)]).ok, open);
  assert.equal(protoSnapshot(), before);
});

test("round 34 fuzz: rich bodies of any shape and depth give code blocks or nothing, never a throw; deleted and system comments are skipped", () => {
  const node = (f: Fuzz, depth: number): unknown => {
    if (depth <= 0 || f.bool(0.2)) return f.bool(0.5) ? { type: "text", text: f.string() } : f.value(1);
    const type = f.pick(["doc", "paragraph", "codeBlock", "code_block", "bulletList", f.string(8), 7, null]);
    const attrs = f.bool(0.5) ? { language: f.pick(["json", "JSON", "", null, "js", 3, undefined]) } : f.bool(0.3) ? { lang: "json" } : f.value(1);
    return { type, attrs, content: f.bool(0.8) ? Array.from({ length: f.int(0, 3) }, () => node(f, depth - 1)) : f.value(1) };
  };
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 300; i += 1) {
      const body = f.bool(0.5) ? { doc: node(f, 5) } : node(f, 5);
      let blocks: string[];
      try {
        blocks = richJsonBlocks(body);
      } catch (error) {
        assert.fail(`${replay(seed, i, body)} threw ${String(error)}`);
      }
      assert.ok(blocks.every((b) => typeof b === "string"), replay(seed, i));
      const extracted = extractPropRequest(ticket(), [comment(null, { body } as Partial<CommentOut>)]);
      assert.ok(extracted.ok ? validatePropModel(extracted.prop).ok : /^prop CR-77 /.test(extracted.error), replay(seed, i));
    }
  }
  // A deep body (a long chain of paragraphs): read to the end, no stack overflow.
  let deep: unknown = { type: "codeBlock", attrs: { language: "json" }, content: [{ type: "text", text: JSON.stringify(PROP) }] };
  for (let d = 0; d < 2000; d += 1) deep = { type: "paragraph", content: [deep] };
  assert.ok(extractPropRequest(ticket(), [comment(null, { body: { doc: deep } } as Partial<CommentOut>)]).ok, "2000 levels deep");
  // Skipped comments: the newest readable one decides.
  const good = comment(`\`\`\`json\n${JSON.stringify(PROP)}\n\`\`\``);
  assert.ok(extractPropRequest(ticket(), [good, comment("```json\n{broken\n```", { deletedAt: "2026-10-23T04:01:00Z" } as Partial<CommentOut>), comment("```json\n{broken\n```", { kind: "system" } as Partial<CommentOut>)]).ok);
  assert.ok(!extractPropRequest(ticket(), [good, comment("```json\n{broken\n```", { id: "c2" })]).ok, "the newest block decides, even when broken");
  assert.ok(!extractPropRequest(ticket({ labels: [] }), [good]).ok, "no prop label, no prop");
});

test("round 34 fuzz: a ticket's prop into the town over the demo's model: odd titles, place lines and comments import or are refused in one line, and the town stays valid", async () => {
  const before = protoSnapshot();
  const model = await demoModel();
  const slugs = model.buildings.map((b) => b.slug);
  assert.ok(slugs.length > 0);
  const context = { knownStyles: ["greenhouse"], builtinIds: builtinIds(definitions) };
  const doc = emptyTownDocument();
  const UUID = (n: number) => `6f1c0d3e-2b4a-4c6d-8e9f-${String(n).padStart(12, "0")}`;
  let placed = 0,
    kept = 0,
    refused = 0;
  for (const seed of SEEDS) {
    const f = new Fuzz(seed);
    for (let i = 0; i < 150; i += 1) {
      const room = f.pick([...ROOM_KINDS, ...ODD_STRINGS.slice(0, 20)]);
      const agent = f.pick([...model.buildings.flatMap((b) => b.agents.map((a) => a.name)), f.string(12)]);
      const placeLine = f.pick([`place: ${room}`, `place: the ${room} room`, `place: desk of ${agent}`, `Place: ${f.string(30)}`, "", f.string(60), `place:${"x".repeat(5000)}`]);
      const title = f.pick([`Prop: a fern for the ${room}`, `${f.string(30)} in ${room}`, f.string(80), "", `to ${agent}`]);
      const t = ticket({ key: f.bool(0.9) ? `CR-${f.int(1, 999)}` : f.string(10), title, bodyMarkdown: f.bool(0.8) ? `${f.string(20)}\n${placeLine}\n${f.string(20)}` : null, body: f.bool(0.3) ? (f.value(3) as Exclude<PropTicket["body"], undefined>) : null, project: { slug: f.bool(0.9) ? f.pick(slugs) : f.string(10) } });
      const inner = f.bool(0.5) ? JSON.stringify(PROP) : f.jsonText(f.mutate(PROP, f.int(1, 2)));
      const comments = [comment(`${f.string(10)}\n\`\`\`json\n${inner}\n\`\`\`\n${f.string(10)}`)];
      let result;
      try {
        result = importPropRequest({ doc, context, builtins: definitions, model, ticket: t, comments, placementId: UUID(i) });
      } catch (error) {
        assert.fail(`${replay(seed, i, { title, placeLine, inner })} threw ${String(error)}`);
      }
      if (result.ok) {
        const valid = validateTownDocument(result.doc, context);
        assert.ok(valid.ok, `${replay(seed, i)}: the town after the import validates: ${valid.ok ? "" : JSON.stringify(valid.errors[0])}`);
        const prop = result.doc.userProps.find((p) => p.id === result.propId);
        assert.deepEqual(prop?.provenance, { kind: "ticket", ticketKey: t.key }, replay(seed, i));
        if (result.placementId === null) kept += 1;
        else {
          placed += 1;
          assert.equal(result.placementId, UUID(i), replay(seed, i));
          assert.ok(result.doc.placements.some((p) => p.id === UUID(i) && p.propId === result.propId), replay(seed, i));
        }
        assert.ok(result.note === null || (typeof result.note === "string" && result.note !== ""), replay(seed, i));
      } else {
        refused += 1;
        assert.ok(ROOM_KINDS.includes(result.invalid.room) && typeof result.invalid.slug === "string" && /^(prop|ticket) /.test(result.invalid.error), replay(seed, i, result.invalid));
      }
      // The place is read without a throw whatever the text, and names a room of the ticket's building.
      const place = placeFor(t, model);
      assert.ok(ROOM_KINDS.includes(place.at.room) && typeof place.at.building === "string" && (place.attachment !== null || place.at.building === t.project.slug), replay(seed, i, place));
    }
  }
  assert.ok(placed > 30 && refused > 30, `the mix: ${placed} placed, ${kept} kept in the catalogue, ${refused} refused`);
  assert.equal(protoSnapshot(), before);
});
