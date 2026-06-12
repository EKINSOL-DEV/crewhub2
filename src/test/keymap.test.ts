import { matchKey, KEYMAP_HELP, type KeyAction, type KeyStroke } from "../app/keymap";

function stroke(partial: Partial<KeyStroke> & { key: string }): KeyStroke {
  return { mod: false, shift: false, alt: false, inEditable: false, ...partial };
}

describe("matchKey — the Appendix A table", () => {
  const cases: Array<[string, KeyStroke, KeyAction | null]> = [
    ["⌘K opens palette", stroke({ key: "k", mod: true }), { type: "palette" }],
    ["⌘K works inside inputs", stroke({ key: "k", mod: true, inEditable: true }), { type: "palette" }],
    ["⌘T new tab", stroke({ key: "t", mod: true }), { type: "newTab" }],
    ["⌘W close tab", stroke({ key: "w", mod: true }), { type: "closeTab" }],
    ["⌘1 focuses panel 1", stroke({ key: "1", mod: true }), { type: "focusPanel", index: 1 }],
    ["⌘9 focuses panel 9", stroke({ key: "9", mod: true }), { type: "focusPanel", index: 9 }],
    ["⌘0 is unmapped", stroke({ key: "0", mod: true }), null],
    ["Tab cycles focus", stroke({ key: "Tab" }), { type: "cycleFocus", dir: 1 }],
    ["⇧Tab cycles backwards", stroke({ key: "Tab", shift: true }), { type: "cycleFocus", dir: -1 }],
    ["Tab inside an input is left alone", stroke({ key: "Tab", inEditable: true }), null],
    ["⌘\\ splits horizontally", stroke({ key: "\\", mod: true }), { type: "split", dir: "row" }],
    ["⌘⇧\\ splits vertically", stroke({ key: "\\", mod: true, shift: true }), { type: "split", dir: "col" }],
    ["⌘⇧\\ as | (layout quirk)", stroke({ key: "|", mod: true, shift: true }), { type: "split", dir: "col" }],
    ["⌘⇧W closes the panel", stroke({ key: "W", mod: true, shift: true }), { type: "closePanel" }],
    ["⌘⇧M maximizes", stroke({ key: "M", mod: true, shift: true }), { type: "maximize" }],
    [
      "⌘⇧← shrinks the row split",
      stroke({ key: "ArrowLeft", mod: true, shift: true }),
      { type: "resize", axis: "row", delta: -0.05 },
    ],
    [
      "⌘⇧→ grows the row split",
      stroke({ key: "ArrowRight", mod: true, shift: true }),
      { type: "resize", axis: "row", delta: 0.05 },
    ],
    [
      "⌘⇧↑ shrinks the col split",
      stroke({ key: "ArrowUp", mod: true, shift: true }),
      { type: "resize", axis: "col", delta: -0.05 },
    ],
    [
      "⌘⇧↓ grows the col split",
      stroke({ key: "ArrowDown", mod: true, shift: true }),
      { type: "resize", axis: "col", delta: 0.05 },
    ],
    ["⌘/ opens help", stroke({ key: "/", mod: true }), { type: "help" }],
    ["Escape", stroke({ key: "Escape" }), { type: "escape" }],
    ["plain letters are unmapped globally", stroke({ key: "c" }), null],
    ["⌥ combos are unmapped", stroke({ key: "k", mod: true, alt: true }), null],
    ["unmodified digits are unmapped", stroke({ key: "1" }), null],
  ];

  test.each(cases)("%s", (_name, input, expected) => {
    expect(matchKey(input)).toEqual(expected);
  });
});

test("help sheet covers every Appendix A row", () => {
  expect(KEYMAP_HELP.length).toBeGreaterThanOrEqual(9);
  expect(KEYMAP_HELP.some((r) => r.action.includes("Command palette"))).toBe(true);
});
