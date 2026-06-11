import {
  buildPreset,
  clampRatio,
  closeLeaf,
  dropEdgeAt,
  findAncestorSplit,
  findLeaf,
  findSplit,
  leaves,
  makeLeaf,
  moveLeaf,
  parseTabs,
  replaceKind,
  setLeafParams,
  setRatio,
  splitLeaf,
  swapLeaves,
  type LayoutNode,
  type WorkspaceTab,
} from "../app/layout-tree";

function leafIds(root: LayoutNode): string[] {
  return leaves(root).map((l) => l.id);
}

describe("makeLeaf", () => {
  test("creates a leaf with a unique id and given kind", () => {
    const a = makeLeaf("chat");
    const b = makeLeaf("chat");
    expect(a.type).toBe("leaf");
    expect(a.kind).toBe("chat");
    expect(a.id).not.toBe(b.id);
  });

  test("carries params", () => {
    const l = makeLeaf("chat", { sessionId: "s1" });
    expect(l.params).toEqual({ sessionId: "s1" });
  });
});

describe("clampRatio", () => {
  test("clamps into 0.1..0.9", () => {
    expect(clampRatio(0.5)).toBe(0.5);
    expect(clampRatio(-1)).toBe(0.1);
    expect(clampRatio(0.05)).toBe(0.1);
    expect(clampRatio(0.95)).toBe(0.9);
    expect(clampRatio(2)).toBe(0.9);
  });

  test("non-finite ratios fall back to 0.5", () => {
    expect(clampRatio(Number.NaN)).toBe(0.5);
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(0.9);
  });
});

describe("splitLeaf", () => {
  test("replaces the leaf with a split containing old + new leaf", () => {
    const root = makeLeaf("chat");
    const { root: next, newLeaf } = splitLeaf(root, root.id, "row", "sessions");
    expect(next.type).toBe("split");
    if (next.type !== "split") throw new Error("expected split");
    expect(next.dir).toBe("row");
    expect(next.ratio).toBe(0.5);
    expect(next.a).toEqual(root);
    expect(next.b).toBe(newLeaf);
    expect(newLeaf?.kind).toBe("sessions");
  });

  test("splits a nested leaf, leaving the rest untouched", () => {
    const chat = makeLeaf("chat");
    const sessions = makeLeaf("sessions");
    const root: LayoutNode = { type: "split", id: "s", dir: "row", ratio: 0.6, a: chat, b: sessions };
    const { root: next } = splitLeaf(root, sessions.id, "col", "activity");
    expect(leaves(next).map((l) => l.kind)).toEqual(["chat", "sessions", "activity"]);
    if (next.type !== "split") throw new Error("expected split");
    expect(next.a).toEqual(chat);
  });

  test("unknown leaf id returns the tree unchanged", () => {
    const root = makeLeaf("chat");
    const { root: next, newLeaf } = splitLeaf(root, "nope", "row", "sessions");
    expect(next).toEqual(root);
    expect(newLeaf).toBeNull();
  });
});

describe("closeLeaf", () => {
  test("closing the only leaf yields a welcome leaf, never an empty tree", () => {
    const root = makeLeaf("chat");
    const next = closeLeaf(root, root.id);
    expect(next.type).toBe("leaf");
    if (next.type !== "leaf") throw new Error("expected leaf");
    expect(next.kind).toBe("welcome");
  });

  test("closing one side of a split promotes the sibling", () => {
    const chat = makeLeaf("chat");
    const sessions = makeLeaf("sessions");
    const root: LayoutNode = { type: "split", id: "s", dir: "row", ratio: 0.5, a: chat, b: sessions };
    expect(closeLeaf(root, chat.id)).toEqual(sessions);
    expect(closeLeaf(root, sessions.id)).toEqual(chat);
  });

  test("closing a nested leaf collapses only its parent split", () => {
    const chat = makeLeaf("chat");
    const sessions = makeLeaf("sessions");
    const activity = makeLeaf("activity");
    const inner: LayoutNode = { type: "split", id: "i", dir: "col", ratio: 0.5, a: sessions, b: activity };
    const root: LayoutNode = { type: "split", id: "o", dir: "row", ratio: 0.6, a: chat, b: inner };
    const next = closeLeaf(root, activity.id);
    expect(next).toEqual({ type: "split", id: "o", dir: "row", ratio: 0.6, a: chat, b: sessions });
  });

  test("unknown id is a no-op", () => {
    const chat = makeLeaf("chat");
    const sessions = makeLeaf("sessions");
    const root: LayoutNode = { type: "split", id: "s", dir: "row", ratio: 0.5, a: chat, b: sessions };
    expect(closeLeaf(root, "nope")).toEqual(root);
  });
});

describe("setRatio", () => {
  test("sets and clamps the ratio of the addressed split", () => {
    const root: LayoutNode = {
      type: "split",
      id: "s",
      dir: "row",
      ratio: 0.5,
      a: makeLeaf("chat"),
      b: makeLeaf("sessions"),
    };
    const next = setRatio(root, "s", 0.7);
    if (next.type !== "split") throw new Error("expected split");
    expect(next.ratio).toBe(0.7);
    const clamped = setRatio(root, "s", 0.99);
    if (clamped.type !== "split") throw new Error("expected split");
    expect(clamped.ratio).toBe(0.9);
  });

  test("leaves other splits alone", () => {
    const inner: LayoutNode = {
      type: "split",
      id: "i",
      dir: "col",
      ratio: 0.4,
      a: makeLeaf("sessions"),
      b: makeLeaf("activity"),
    };
    const root: LayoutNode = {
      type: "split",
      id: "o",
      dir: "row",
      ratio: 0.5,
      a: makeLeaf("chat"),
      b: inner,
    };
    const next = setRatio(root, "i", 0.8);
    if (next.type !== "split") throw new Error("expected split");
    expect(next.ratio).toBe(0.5);
    if (next.b.type !== "split") throw new Error("expected split");
    expect(next.b.ratio).toBe(0.8);
  });
});

describe("swapLeaves", () => {
  test("swaps two leaves in place (ids travel with the leaves)", () => {
    const chat = makeLeaf("chat");
    const sessions = makeLeaf("sessions");
    const activity = makeLeaf("activity");
    const inner: LayoutNode = { type: "split", id: "i", dir: "col", ratio: 0.5, a: sessions, b: activity };
    const root: LayoutNode = { type: "split", id: "o", dir: "row", ratio: 0.5, a: chat, b: inner };
    const next = swapLeaves(root, chat.id, activity.id);
    expect(leafIds(next)).toEqual([activity.id, sessions.id, chat.id]);
  });

  test("swapping a leaf with itself or an unknown id is a no-op", () => {
    const chat = makeLeaf("chat");
    const sessions = makeLeaf("sessions");
    const root: LayoutNode = { type: "split", id: "s", dir: "row", ratio: 0.5, a: chat, b: sessions };
    expect(swapLeaves(root, chat.id, chat.id)).toEqual(root);
    expect(swapLeaves(root, chat.id, "nope")).toEqual(root);
  });
});

describe("findLeaf / findSplit / leaves", () => {
  const chat = makeLeaf("chat");
  const sessions = makeLeaf("sessions");
  const activity = makeLeaf("activity");
  const inner: LayoutNode = { type: "split", id: "i", dir: "col", ratio: 0.5, a: sessions, b: activity };
  const root: LayoutNode = { type: "split", id: "o", dir: "row", ratio: 0.5, a: chat, b: inner };

  test("findLeaf returns the leaf or null", () => {
    expect(findLeaf(root, sessions.id)).toEqual(sessions);
    expect(findLeaf(root, "nope")).toBeNull();
    expect(findLeaf(root, "i")).toBeNull(); // split ids are not leaves
  });

  test("findSplit returns the split or null", () => {
    expect(findSplit(root, "i")).toEqual(inner);
    expect(findSplit(root, chat.id)).toBeNull();
  });

  test("leaves returns leaves in visual (in-)order", () => {
    expect(leaves(root)).toEqual([chat, sessions, activity]);
    expect(leaves(chat)).toEqual([chat]);
  });
});

describe("findAncestorSplit", () => {
  const chat = makeLeaf("chat");
  const sessions = makeLeaf("sessions");
  const activity = makeLeaf("activity");
  const inner: LayoutNode = { type: "split", id: "i", dir: "col", ratio: 0.5, a: sessions, b: activity };
  const root: LayoutNode = { type: "split", id: "o", dir: "row", ratio: 0.5, a: chat, b: inner };

  test("finds the nearest ancestor split with the requested direction", () => {
    expect(findAncestorSplit(root, activity.id, "col")?.id).toBe("i");
    expect(findAncestorSplit(root, activity.id, "row")?.id).toBe("o");
    expect(findAncestorSplit(root, chat.id, "row")?.id).toBe("o");
  });

  test("returns null when no ancestor matches", () => {
    expect(findAncestorSplit(root, chat.id, "col")).toBeNull();
    expect(findAncestorSplit(makeLeaf("chat"), "x", "row")).toBeNull();
    expect(findAncestorSplit(root, "nope", "row")).toBeNull();
  });
});

describe("replaceKind / setLeafParams", () => {
  test("replaceKind changes kind and resets params", () => {
    const l = makeLeaf("welcome");
    const next = replaceKind(l, l.id, "chat", { sessionId: "s1" });
    if (next.type !== "leaf") throw new Error("expected leaf");
    expect(next.kind).toBe("chat");
    expect(next.id).toBe(l.id);
    expect(next.params).toEqual({ sessionId: "s1" });
  });

  test("setLeafParams updates only params", () => {
    const l = makeLeaf("chat", { sessionId: "s1" });
    const next = setLeafParams(l, l.id, { sessionId: "s2" });
    if (next.type !== "leaf") throw new Error("expected leaf");
    expect(next.kind).toBe("chat");
    expect(next.params).toEqual({ sessionId: "s2" });
  });
});

describe("moveLeaf", () => {
  function tree() {
    const chat = makeLeaf("chat");
    const sessions = makeLeaf("sessions");
    const activity = makeLeaf("activity");
    const inner: LayoutNode = { type: "split", id: "i", dir: "col", ratio: 0.5, a: sessions, b: activity };
    const root: LayoutNode = { type: "split", id: "o", dir: "row", ratio: 0.5, a: chat, b: inner };
    return { chat, sessions, activity, root };
  }

  test("center drop swaps the two leaves", () => {
    const { chat, activity, root } = tree();
    const next = moveLeaf(root, chat.id, activity.id, "center");
    expect(leafIds(next)[0]).toBe(activity.id);
    expect(leafIds(next)[2]).toBe(chat.id);
  });

  test("west drop splits the target into a row with source first", () => {
    const { chat, activity, root } = tree();
    const next = moveLeaf(root, chat.id, activity.id, "w");
    const ls = leaves(next);
    expect(ls.map((l) => l.kind)).toEqual(["sessions", "chat", "activity"]);
    // chat sits in a row split before activity
    const parent = findSplitContaining(next, chat.id);
    expect(parent?.dir).toBe("row");
    expect(parent?.a.type === "leaf" && parent.a.id).toBe(chat.id);
  });

  test("south drop splits the target into a col with source second", () => {
    const { chat, sessions, root } = tree();
    const next = moveLeaf(root, chat.id, sessions.id, "s");
    const parent = findSplitContaining(next, chat.id);
    expect(parent?.dir).toBe("col");
    expect(parent?.b.type === "leaf" && parent.b.id).toBe(chat.id);
  });

  test("north and east orientations", () => {
    const { chat, sessions, root } = tree();
    const n = findSplitContaining(moveLeaf(root, chat.id, sessions.id, "n"), chat.id);
    expect(n?.dir).toBe("col");
    expect(n?.a.type === "leaf" && n.a.id).toBe(chat.id);
    const e = findSplitContaining(moveLeaf(root, chat.id, sessions.id, "e"), chat.id);
    expect(e?.dir).toBe("row");
    expect(e?.b.type === "leaf" && e.b.id).toBe(chat.id);
  });

  test("dropping a leaf on itself or unknown ids is a no-op", () => {
    const { chat, root } = tree();
    expect(moveLeaf(root, chat.id, chat.id, "w")).toEqual(root);
    expect(moveLeaf(root, "nope", chat.id, "w")).toEqual(root);
    expect(moveLeaf(root, chat.id, "nope", "w")).toEqual(root);
  });

  test("moving one side of a two-leaf root onto the other re-orients the split", () => {
    const chat = makeLeaf("chat");
    const sessions = makeLeaf("sessions");
    const root: LayoutNode = { type: "split", id: "s", dir: "row", ratio: 0.5, a: chat, b: sessions };
    const next = moveLeaf(root, chat.id, sessions.id, "s");
    if (next.type !== "split") throw new Error("expected split");
    expect(next.dir).toBe("col");
    expect(next.a.id).toBe(sessions.id);
    expect(next.b.id).toBe(chat.id);
  });
});

describe("dropEdgeAt", () => {
  test("outer bands map to edges, middle swaps", () => {
    expect(dropEdgeAt(0.1, 0.5)).toBe("w");
    expect(dropEdgeAt(0.9, 0.5)).toBe("e");
    expect(dropEdgeAt(0.5, 0.1)).toBe("n");
    expect(dropEdgeAt(0.5, 0.9)).toBe("s");
    expect(dropEdgeAt(0.5, 0.5)).toBe("center");
  });

  test("horizontal bands win over vertical at corners", () => {
    expect(dropEdgeAt(0.1, 0.1)).toBe("w");
    expect(dropEdgeAt(0.9, 0.9)).toBe("e");
  });
});

describe("presets", () => {
  test("focus is a single chat leaf", () => {
    const p = buildPreset("focus");
    expect(p.type).toBe("leaf");
    expect(leaves(p).map((l) => l.kind)).toEqual(["chat"]);
  });

  test("cockpit is chat | sessions/activity", () => {
    const p = buildPreset("cockpit");
    expect(leaves(p).map((l) => l.kind)).toEqual(["chat", "sessions", "activity"]);
    if (p.type !== "split") throw new Error("expected split");
    expect(p.dir).toBe("row");
    expect(p.b.type).toBe("split");
  });

  test("monitor is sessions | activity", () => {
    const p = buildPreset("monitor");
    expect(leaves(p).map((l) => l.kind)).toEqual(["sessions", "activity"]);
  });

  test("preset ids are fresh on every build", () => {
    expect(leafIds(buildPreset("cockpit"))).not.toEqual(leafIds(buildPreset("cockpit")));
  });
});

describe("parseTabs", () => {
  test("round-trips serialized tabs", () => {
    const tabs: WorkspaceTab[] = [
      { id: "t1", name: "Cockpit", root: buildPreset("cockpit"), projectFilter: null },
      { id: "t2", name: "Focus", root: buildPreset("focus"), projectFilter: "proj-1" },
    ];
    expect(parseTabs(JSON.stringify(tabs))).toEqual(tabs);
  });

  test("rejects corrupt JSON", () => {
    expect(parseTabs("{nope")).toBeNull();
    expect(parseTabs("")).toBeNull();
    expect(parseTabs(null)).toBeNull();
  });

  test("rejects structurally invalid trees", () => {
    expect(parseTabs(JSON.stringify([{ id: "t", name: "x" }]))).toBeNull();
    expect(
      parseTabs(JSON.stringify([{ id: "t", name: "x", root: { type: "leaf" }, projectFilter: null }])),
    ).toBeNull();
    expect(parseTabs(JSON.stringify({ not: "an array" }))).toBeNull();
    expect(
      parseTabs(
        JSON.stringify([
          {
            id: "t",
            name: "x",
            root: { type: "split", id: "s", dir: "diagonal", ratio: 0.5 },
            projectFilter: null,
          },
        ]),
      ),
    ).toBeNull();
    expect(
      parseTabs(
        JSON.stringify([
          { id: "t", name: "x", root: { type: "leaf", id: "l", kind: "no-such-kind" }, projectFilter: null },
        ]),
      ),
    ).toBeNull();
  });

  test("accepts unknown extra fields but validates leaf kinds", () => {
    const ok = [
      { id: "t", name: "x", root: { type: "leaf", id: "l", kind: "chat" }, projectFilter: null, extra: 1 },
    ];
    const parsed = parseTabs(JSON.stringify(ok));
    expect(parsed?.[0]?.root).toEqual({ type: "leaf", id: "l", kind: "chat" });
  });
});

/** Test helper: find the split node that directly contains leaf `id`. */
function findSplitContaining(root: LayoutNode, id: string): Extract<LayoutNode, { type: "split" }> | null {
  if (root.type === "leaf") return null;
  if ((root.a.type === "leaf" && root.a.id === id) || (root.b.type === "leaf" && root.b.id === id))
    return root;
  return findSplitContaining(root.a, id) ?? findSplitContaining(root.b, id);
}
