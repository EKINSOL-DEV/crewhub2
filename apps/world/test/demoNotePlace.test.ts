/**
 * Design choice W3 (`cards`): the demo's "no crewhub-loops web app to open" note explains why a ticket key is not a
 * link, so it stays only where a key would be one in live mode: the object card, and the agent card's tooltip on its
 * keys. An agent plate carries no link, so it carries no note. The canvas draws with React under Vite; the hold reads
 * the source, as tour.test.ts reads Tour.tsx.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const canvas = readFileSync(path.join(here, "..", "src", "components", "WorldCanvas.tsx"), "utf8");
const card = readFileSync(path.join(here, "..", "src", "components", "AgentCard.tsx"), "utf8");

test("W3 (cards): the agent plate carries no demo note; the object card still does; the agent card's key tooltips stay", () => {
  const plateStart = canvas.indexOf("{plate ? (");
  assert.ok(plateStart > 0, "the agent plate's branch is found");
  // To the else branch (`full && (`): the plate's own `) : (` is not the first, the proxy ternary's inside it is.
  const plate = canvas.slice(plateStart, canvas.indexOf("full && (", plateStart));
  assert.match(plate, /className=\{`agent-plate/, "the slice is the plate");
  assert.match(plate, /Lit: \{alert\}/, "the slice reaches the plate's last row");
  assert.doesNotMatch(plate, /<DemoNote/, "no note on the plate");
  assert.equal(canvas.match(/<DemoNote model=\{model\} \/>/g)?.length, 1, "one note is left: the object card's");
  assert.equal(card.match(/title=\{demo \? "Demo: there is no crewhub-loops web app to open" : undefined\}/g)?.length, 2, "the agent card's two key tooltips");
});
