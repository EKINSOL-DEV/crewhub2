// Room-rule evaluation, mirrored from the backend (M3 T8, EKI-87 / D-M3-10):
// src-tauri/src/store/room_rules.rs is the authority — this TS twin exists so
// the rule editor's "test a session" preview and the sessions panel's `auto`
// chip explain EXACTLY what Rust will do on SessionEvent::Discovered. Any
// semantic change must land in both places (both sides are fixture-tested on
// the same cases).
import type { RoomRule, SessionBinding, SessionMeta } from "@/ipc/bindings";

/** Closed rule types (mirrors the schema CHECK + ROOM_RULE_TYPES). */
export const ROOM_RULE_TYPES = ["keyword", "model", "path_pattern", "origin"] as const;
export type RoomRuleType = (typeof ROOM_RULE_TYPES)[number];

/** What the evaluator gets to look at — the preview form edits exactly this. */
export interface RuleProbe {
  project_path: string;
  model: string | null;
  origin: "managed" | "external";
  summary: string | null;
}

/**
 * The documented glob dialect (room_rules.rs `glob_match`): `*` matches any
 * run of characters INCLUDING `/`, `?` matches exactly one. Case-sensitive,
 * no character classes. Iterative backtracking — same language as the Rust
 * recursion, immune to pathological star counts.
 */
export function globMatch(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (p < pattern.length && (pattern[p] === "?" || pattern[p] === text[t])) {
      p += 1;
      t += 1;
    } else if (p < pattern.length && pattern[p] === "*") {
      star = p;
      p += 1;
      mark = t;
    } else if (star >= 0) {
      p = star + 1;
      mark += 1;
      t = mark;
    } else {
      return false;
    }
  }
  while (pattern[p] === "*") p += 1;
  return p === pattern.length;
}

/** Last path segment, "" for the root — mirrors Rust's `Path::file_name()`. */
function baseName(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.split("/").pop() ?? "";
}

/** One rule against one probe — rule_matches() in room_rules.rs. */
export function ruleMatches(rule: RoomRule, probe: RuleProbe): boolean {
  switch (rule.rule_type) {
    case "keyword": {
      const needle = rule.rule_value.toLowerCase();
      if (!needle) return false; // empty keyword never matches everything
      if (probe.summary !== null && probe.summary.toLowerCase().includes(needle)) return true;
      return baseName(probe.project_path).toLowerCase().includes(needle);
    }
    case "model":
      return probe.model !== null && probe.model.toLowerCase().includes(rule.rule_value.toLowerCase());
    case "path_pattern":
      return globMatch(rule.rule_value, probe.project_path);
    case "origin":
      return rule.rule_value.toLowerCase() === probe.origin;
    default:
      return false;
  }
}

/**
 * The winning rule, or null: highest `priority` wins, ties break on the
 * NEWEST rule. `rules` must be ordered as `listRoomRules` returns them
 * (priority desc, then oldest→newest), so within a priority the last match
 * is the newest — assign_room() in room_rules.rs, but returning the rule
 * itself so UI surfaces can name it.
 */
export function assignRoom(rules: RoomRule[], probe: RuleProbe): RoomRule | null {
  let best: RoomRule | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, probe)) continue;
    if (best === null || rule.priority >= best.priority) best = rule;
  }
  return best;
}

/** Probe a live session the way the Rust hook does on Discovered. */
export function probeFromMeta(meta: SessionMeta, summary: string | null = null): RuleProbe {
  return {
    project_path: meta.project_path,
    model: meta.model,
    origin: meta.origin === "Managed" ? "managed" : "external",
    summary,
  };
}

/**
 * The `auto` chip heuristic (T8): a binding looks rule-assigned when it
 * carries nothing a human would have set (no agent, no name, not pinned) AND
 * the evaluator agrees with its room. A manual room change disagrees with
 * the evaluator (or sets other fields) and the chip disappears — it is just
 * a normal binding now. Returns the explaining rule for the tooltip.
 */
export function explainAutoBinding(
  binding: SessionBinding | null,
  meta: SessionMeta,
  rules: RoomRule[],
): RoomRule | null {
  if (!binding?.room_id) return null;
  if (binding.agent_id !== null || binding.display_name !== null || binding.pinned) return null;
  const winner = assignRoom(rules, probeFromMeta(meta));
  return winner !== null && winner.room_id === binding.room_id ? winner : null;
}

/** Tooltip / preview copy: names the rule the way the editor shows it. */
export function ruleLabel(rule: RoomRule): string {
  return `${rule.rule_type} · ${rule.rule_value}`;
}

/** Per-type editor affordances — placeholder + the honest matching hint. */
export const RULE_TYPE_HINTS: Record<RoomRuleType, { placeholder: string; hint: string }> = {
  keyword: {
    placeholder: "e.g. crewhub",
    hint: "case-insensitive match on the session summary or the project folder name",
  },
  model: {
    placeholder: "e.g. haiku",
    hint: "case-insensitive substring of the session's model id",
  },
  path_pattern: {
    placeholder: "/Users/*/code/crewhub*",
    hint: "glob on the project path — * matches any run (even /), ? exactly one character; case-sensitive",
  },
  origin: {
    placeholder: "managed | external",
    hint: "managed = spawned by CrewHub, external = discovered from a terminal",
  },
};
