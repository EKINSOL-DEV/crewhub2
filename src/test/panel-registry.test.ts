import { PANEL_KINDS } from "../app/layout-tree";
import { buildShellActions } from "../app/palette-actions";
import { PANELS, PANEL_LIST } from "../app/panel-registry";

test("every panel kind has a complete registry entry", () => {
  for (const kind of PANEL_KINDS) {
    const def = PANELS[kind];
    expect(def.kind).toBe(kind);
    expect(def.label.length).toBeGreaterThan(0);
    expect(def.emoji.length).toBeGreaterThan(0);
    expect(def.description.length).toBeGreaterThan(0);
    expect(def.keywords.length).toBeGreaterThan(0);
    expect(def.component).toBeDefined();
    expect(def.emptyState.emoji.length).toBeGreaterThan(0);
    expect(def.emptyState.title.length).toBeGreaterThan(0);
    expect(def.emptyState.hint.length).toBeGreaterThan(0);
  }
  expect(PANEL_LIST).toHaveLength(PANEL_KINDS.length);
});

test("Quiet Office empty states carry the D-M2-6 names", () => {
  expect(PANELS.chat.emptyState.title).toMatch(/Nobody's talking yet/);
  expect(PANELS.sessions.emptyState.title).toMatch(/The office is quiet/);
  expect(PANELS.activity.emptyState.title).toMatch(/All calm/);
  expect(PANELS.history.emptyState.title).toMatch(/No past lives yet/);
  expect(PANELS.crew.emptyState.title).toMatch(/Hire your first agent/);
});

test("shortcutHint keys are unique single letters", () => {
  const hints = PANEL_LIST.flatMap((d) => (d.shortcutHint ? [d.shortcutHint] : []));
  expect(new Set(hints).size).toBe(hints.length);
  for (const h of hints) expect(h).toMatch(/^[a-z]$/);
});

test("world-primary: the world kind survives for persisted layouts but hides from pickers", () => {
  expect(PANELS.world.hiddenFromPicker).toBe(true);
  expect(PANELS.world.shortcutHint).toBeUndefined(); // no single-key spawn either
  expect(PANEL_KINDS).toContain("world"); // old layout trees still parse
});

test("world-primary: palette offers view switches instead of a world panel", () => {
  const ids = buildShellActions().map((a) => a.id);
  expect(ids).not.toContain("panel.open.world");
  expect(ids).toContain("view.world");
  expect(ids).toContain("view.workspace");
});
