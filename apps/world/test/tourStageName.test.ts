/**
 * Design choice T3 (`town`): what the tour card says is highlighted, for a screen reader. The stage's own name
 * (`aria-label="CrewHub World"`) is the app's name and the demo's first project's; for the two stage steps the step's
 * own name is clearer. Every other step keeps the element's own name, with the step's as the fallback.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { highlightedWords, tourSteps } from "../src/state/tour.ts";

test("T3 (town): the stage steps say their own name whatever the stage is called; other steps say the element's name, else their own; no target says nothing is highlighted", () => {
  for (const mode of ["demo", "live"] as const) {
    const steps = tourSteps(mode);
    assert.deepEqual(steps.filter((s) => s.target === "main.world-stage").map((s) => s.id), ["town", "card"], `${mode}: the two stage steps`);
    const [town, building, card] = steps;
    assert.equal(highlightedWords(town!, "CrewHub World"), "Highlighted on the screen: the town.");
    assert.equal(highlightedWords(card!, "CrewHub World"), "Highlighted on the screen: the town, where the figures stand.");
    assert.equal(highlightedWords(town!, null), "Highlighted on the screen: the town.");
    assert.equal(highlightedWords(building!, "Jump to a district, project or agent"), "Highlighted on the screen: Jump to a district, project or agent.");
    assert.equal(highlightedWords(building!, null), "Highlighted on the screen: the jump list button.");
    for (const s of steps.filter((s) => s.target === null)) assert.equal(highlightedWords(s, "anything"), `Nothing is highlighted: ${s.targetName}.`);
  }
});
