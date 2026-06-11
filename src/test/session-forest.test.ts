// T16 (EKI-47 TS half): buildSessionForest — pure roots resolution + forest
// assembly from SessionMeta.parent links, orphan tolerance, recency sort,
// team grouping (D-M4-9). Drives the tree UI (EKI-54).
import type { SessionMeta } from "@/ipc/bindings";
import {
  buildSessionForest,
  groupSiblingsByTeam,
  sessionKey,
  type StoredSessionMeta,
} from "@/stores/sessions";
import { meta, sid } from "./fixtures";

function world(...metas: StoredSessionMeta[]): Record<string, StoredSessionMeta> {
  return Object.fromEntries(metas.map((m) => [sessionKey(m.id), m]));
}

function child(id: string, parent: string, extra: Partial<SessionMeta> = {}): SessionMeta {
  return meta({ id: sid(id), parent: sid(parent), ...extra });
}

test("flat sessions are roots, newest activity first", () => {
  const forest = buildSessionForest(
    world(meta({ id: sid("a"), last_activity_ms: 10 }), meta({ id: sid("b"), last_activity_ms: 99 })),
  );
  expect(forest.map((n) => n.meta.id.id)).toEqual(["b", "a"]);
  expect(forest.every((n) => n.children.length === 0)).toBe(true);
});

test("parent links nest; deep chains hold; a busy child bubbles its root up", () => {
  const forest = buildSessionForest(
    world(
      meta({ id: sid("root-quiet"), last_activity_ms: 50 }),
      meta({ id: sid("root-busy"), last_activity_ms: 10 }),
      child("kid", "root-busy", { last_activity_ms: 99 }), // newest activity in the tree
      child("grandkid", "kid", { last_activity_ms: 98 }),
    ),
  );
  // root-busy's subtree has the newest activity → it sorts first
  expect(forest.map((n) => n.meta.id.id)).toEqual(["root-busy", "root-quiet"]);
  expect(forest[0]!.children[0]!.meta.id.id).toBe("kid");
  expect(forest[0]!.children[0]!.children[0]!.meta.id.id).toBe("grandkid");
});

test("orphan tolerance: unknown/gone parents become roots themselves", () => {
  const forest = buildSessionForest(world(child("orphan", "never-seen")));
  expect(forest).toHaveLength(1);
  expect(forest[0]!.meta.id.id).toBe("orphan");
});

test("tombstoned sessions are excluded; their children become orphan roots", () => {
  const forest = buildSessionForest(
    world({ ...meta({ id: sid("dead-parent") }), removed: true as const }, child("survivor", "dead-parent")),
  );
  expect(forest.map((n) => n.meta.id.id)).toEqual(["survivor"]);
});

test("a malformed parent cycle never vanishes a subtree (promote, don't drop)", () => {
  const forest = buildSessionForest(world(child("a", "b"), child("b", "a")));
  // both still visible: one became a root, the other its child
  const visible = (nodes = forest, acc: string[] = []): string[] => {
    for (const n of nodes) {
      acc.push(n.meta.id.id);
      visible(n.children, acc);
    }
    return acc;
  };
  expect(visible().sort()).toEqual(["a", "b"]);
});

test("groupSiblingsByTeam: team members fold into one bracketed group at the newest member's slot", () => {
  const forest = buildSessionForest(
    world(
      meta({ id: sid("solo"), last_activity_ms: 50 }),
      meta({ id: sid("lead"), team: { team_id: "research-crew", role: "lead" }, last_activity_ms: 99 }),
      meta({ id: sid("mate"), team: { team_id: "research-crew", role: "scout" }, last_activity_ms: 10 }),
    ),
  );
  const entries = groupSiblingsByTeam(forest);
  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({ kind: "team", teamId: "research-crew" });
  if (entries[0]?.kind === "team") {
    expect(entries[0].nodes.map((n) => n.meta.id.id)).toEqual(["lead", "mate"]);
  }
  expect(entries[1]).toMatchObject({ kind: "session" });
});

test("no team info → no groups (progressive enhancement, null by construction)", () => {
  const forest = buildSessionForest(world(meta({ id: sid("a") }), meta({ id: sid("b") })));
  const entries = groupSiblingsByTeam(forest);
  expect(entries.every((e) => e.kind === "session")).toBe(true);
});
