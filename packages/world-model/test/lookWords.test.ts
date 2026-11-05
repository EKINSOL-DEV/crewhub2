import assert from "node:assert/strict";
import test from "node:test";
import { describeWorld } from "../src/describe.ts";
import type { WorkObject } from "../src/model.ts";
import { agent, building, object, world } from "./fixtures.ts";

const LOOKS: WorkObject["look"][] = ["folder", "box", "bug-crate", "envelope"];

/** The text view's line for one object of `look`: "<key> "<title>": <kind> as <article> <look words>, <status>; …". */
function lineFor(look: WorkObject["look"]): string {
  const kind = look === "envelope" ? "question" : look === "bug-crate" ? "bug" : look === "box" ? "feature" : "task";
  const model = world([building("cr", [agent("cr-lead")], { objects: [object("CR-1", { look, kind })] })]);
  const line = describeWorld(model).find((l) => /^CR-1 /.test(l.text));
  assert.ok(line, `no line for CR-1 as a ${look}`);
  return line.text;
}

test("every look word is introduced by the article its first sound takes (round 64, w5-14)", () => {
  for (const look of LOOKS) {
    const text = lineFor(look);
    const match = /\bas (an?) (\S+)/.exec(text);
    assert.ok(match, `${look}: no "as a/an …" in "${text}"`);
    const [, article, word] = match as unknown as [string, string, string];
    const vowel = /^[aeiou]/i.test(word);
    assert.equal(article, vowel ? "an" : "a", `${look}: "${article} ${word}" in "${text}"`);
  }
});

test("a question ticket is an envelope with a question mark (round 64, w5-14)", () => {
  assert.match(lineFor("envelope"), /question as an envelope with a question mark/);
});
