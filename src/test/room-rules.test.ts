// TS mirror of the Rust room-rule evaluator (M3 T8, EKI-87 / D-M3-10): the
// cases below intentionally REPLICATE src-tauri/src/store/room_rules.rs tests
// so a semantic drift between preview and backend fails loudly here.
import type { RoomRule, SessionMeta } from "@/ipc/bindings";
import {
  assignRoom,
  explainAutoBinding,
  globMatch,
  probeFromMeta,
  ruleLabel,
  ruleMatches,
  RULE_TYPE_HINTS,
  ROOM_RULE_TYPES,
  type RuleProbe,
} from "@/panels/projects/room-rules";
import { binding, meta, sid } from "./fixtures";

function rule(room: string, ty: string, value: string, priority = 0): RoomRule {
  return {
    id: `r-${room}-${ty}-${value}-${priority}`,
    room_id: room,
    rule_type: ty,
    rule_value: value,
    priority,
  };
}

function probe(overrides: Partial<RuleProbe> = {}): RuleProbe {
  return { project_path: "/p", model: null, origin: "external", summary: null, ...overrides };
}

describe("globMatch — the documented dialect (mirrors glob_match in Rust)", () => {
  test("rust fixture cases", () => {
    expect(globMatch("*", "anything")).toBe(true);
    expect(globMatch("/a/*/c", "/a/b/c")).toBe(true);
    expect(globMatch("/a/*", "/a/b/c/d")).toBe(true); // * crosses '/'
    expect(globMatch("?at", "cat")).toBe(true);
    expect(globMatch("?at", "at")).toBe(false);
    expect(globMatch("/a/b", "/a/b/c")).toBe(false);
    expect(globMatch("", "")).toBe(true);
  });
  test("case-sensitive, star backtracking, trailing stars", () => {
    expect(globMatch("/A/*", "/a/x")).toBe(false);
    expect(globMatch("*crewhub*", "/Users/n/code/crewhub2")).toBe(true);
    expect(globMatch("a*b*c", "a-xx-b-yy-c")).toBe(true);
    expect(globMatch("a*b*c", "a-xx-c")).toBe(false);
    expect(globMatch("abc***", "abc")).toBe(true);
  });
});

describe("ruleMatches per type (mirrors rule_matches)", () => {
  test("keyword: summary OR project dir name, case-insensitive; empty never matches", () => {
    const r = rule("a", "keyword", "crewhub");
    expect(ruleMatches(r, probe({ project_path: "/Users/x/code/CrewHub" }))).toBe(true);
    expect(ruleMatches(r, probe({ project_path: "/Users/x/code/other" }))).toBe(false);
    expect(
      ruleMatches(r, probe({ project_path: "/Users/x/code/other", summary: "Fixing the CrewHub board" })),
    ).toBe(true);
    expect(ruleMatches(rule("a", "keyword", ""), probe({ summary: "anything" }))).toBe(false);
  });

  test("model: case-insensitive substring; null model never matches", () => {
    const r = rule("a", "model", "haiku");
    expect(ruleMatches(r, probe({ model: "claude-haiku-4-5-20251001" }))).toBe(true);
    expect(ruleMatches(r, probe({ model: "claude-sonnet-4-5" }))).toBe(false);
    expect(ruleMatches(r, probe({ model: null }))).toBe(false);
  });

  test("path_pattern globs the project path", () => {
    const r = rule("a", "path_pattern", "/Users/*/code/crewhub*");
    expect(ruleMatches(r, probe({ project_path: "/Users/nicky/code/crewhub2" }))).toBe(true);
    expect(ruleMatches(r, probe({ project_path: "/srv/crewhub2" }))).toBe(false);
  });

  test("origin matches managed/external case-insensitively", () => {
    expect(ruleMatches(rule("a", "origin", "managed"), probe({ origin: "managed" }))).toBe(true);
    expect(ruleMatches(rule("a", "origin", "managed"), probe({ origin: "external" }))).toBe(false);
    expect(ruleMatches(rule("b", "origin", "External"), probe({ origin: "external" }))).toBe(true);
  });

  test("unknown rule types never match", () => {
    expect(ruleMatches(rule("a", "vibes", "x"), probe())).toBe(false);
  });
});

describe("assignRoom precedence (mirrors highest_priority_wins_ties_break_newest)", () => {
  const p = probe({ project_path: "/p/crew", model: "haiku", origin: "managed" });
  // ordered as list_room_rules returns: priority desc, oldest→newest
  const rules = [
    rule("high", "model", "haiku", 9),
    rule("tie-old", "origin", "managed", 5),
    rule("tie-new", "keyword", "crew", 5),
    rule("low", "keyword", "crew", 1),
  ];

  test("highest priority wins; equal priority resolves to the newest", () => {
    expect(assignRoom(rules, p)?.room_id).toBe("high");
    expect(assignRoom(rules.slice(1), p)?.room_id).toBe("tie-new");
    expect(assignRoom(rules, probe({ project_path: "/other" }))).toBeNull();
    expect(assignRoom([], p)).toBeNull();
  });
});

describe("probeFromMeta + explainAutoBinding (the `auto` chip)", () => {
  const m: SessionMeta = meta({
    id: sid("s-1"),
    origin: "External",
    project_path: "/Users/x/code/crewhub2",
    model: "claude-haiku-4-5",
  });
  const rules = [rule("room-lab", "keyword", "crewhub", 3)];

  test("probeFromMeta lowers origin and carries path/model", () => {
    expect(probeFromMeta(m)).toEqual({
      project_path: "/Users/x/code/crewhub2",
      model: "claude-haiku-4-5",
      origin: "external",
      summary: null,
    });
    expect(probeFromMeta(meta({ id: sid("s"), origin: "Managed" })).origin).toBe("managed");
  });

  test("bare rule-shaped binding in the rule's room → explained", () => {
    const b = binding({ session_id: "s-1", room_id: "room-lab" });
    expect(explainAutoBinding(b, m, rules)?.id).toBe(rules[0]?.id);
  });

  test("manual fingerprints or disagreement clear the chip", () => {
    // a different room than the evaluator picks = manual choice
    expect(explainAutoBinding(binding({ session_id: "s-1", room_id: "room-zen" }), m, rules)).toBeNull();
    // any human-set field = manual, even in the same room
    expect(
      explainAutoBinding(
        binding({ session_id: "s-1", room_id: "room-lab", display_name: "Named" }),
        m,
        rules,
      ),
    ).toBeNull();
    expect(
      explainAutoBinding(binding({ session_id: "s-1", room_id: "room-lab", agent_id: "ag-1" }), m, rules),
    ).toBeNull();
    expect(
      explainAutoBinding(binding({ session_id: "s-1", room_id: "room-lab", pinned: true }), m, rules),
    ).toBeNull();
    // no binding / no room at all
    expect(explainAutoBinding(null, m, rules)).toBeNull();
    expect(explainAutoBinding(binding({ session_id: "s-1" }), m, rules)).toBeNull();
  });
});

test("editor affordances: every closed rule type has a label, placeholder and hint", () => {
  expect(ROOM_RULE_TYPES).toEqual(["keyword", "model", "path_pattern", "origin"]);
  for (const t of ROOM_RULE_TYPES) {
    expect(RULE_TYPE_HINTS[t].placeholder.length).toBeGreaterThan(0);
    expect(RULE_TYPE_HINTS[t].hint.length).toBeGreaterThan(0);
  }
  expect(ruleLabel(rule("a", "keyword", "fox", 2))).toBe("keyword · fox");
});
