// Pure layout-tree data model + operations (D-M2-1). No React, no IO.
//
// A LayoutNode is either a leaf (one panel) or a binary split. Binary splits
// keep resize math, keyboard navigation and persistence trivial — the v1 zen
// lesson ported as a concept, not as code.

export type PanelKind =
  | "chat"
  | "sessions"
  | "activity"
  | "history"
  | "crew"
  | "world"
  | "projects"
  | "docs"
  | "settings"
  | "welcome"
  | "debug";

export const PANEL_KINDS: readonly PanelKind[] = [
  "chat",
  "sessions",
  "activity",
  "history",
  "crew",
  "world",
  "projects",
  "docs",
  "settings",
  "welcome",
  "debug",
];

export type SplitDir = "row" | "col";

export type LeafNode = {
  type: "leaf";
  id: string; // stable uuid — focus/maximize target
  kind: PanelKind;
  params?: Record<string, string>; // e.g. { sessionId } for chat
};

export type SplitNode = {
  type: "split";
  id: string;
  dir: SplitDir;
  ratio: number; // 0.1..0.9, first child's share
  a: LayoutNode;
  b: LayoutNode;
};

export type LayoutNode = LeafNode | SplitNode;

export interface WorkspaceTab {
  id: string;
  name: string; // user-editable; default = preset name
  root: LayoutNode;
  projectFilter: string | null; // project id — EKI-22, persisted per tab
}

export type DropEdge = "n" | "s" | "e" | "w" | "center";

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`;
}

export function makeLeaf(kind: PanelKind, params?: Record<string, string>): LeafNode {
  return params ? { type: "leaf", id: uid(), kind, params } : { type: "leaf", id: uid(), kind };
}

export function clampRatio(r: number): number {
  if (Number.isNaN(r)) return 0.5;
  return Math.min(0.9, Math.max(0.1, r));
}

/** Replace leaf `leafId` by a transform; returns a new tree (or the same one if absent). */
function mapLeaf(node: LayoutNode, leafId: string, fn: (leaf: LeafNode) => LayoutNode): LayoutNode {
  if (node.type === "leaf") return node.id === leafId ? fn(node) : node;
  const a = mapLeaf(node.a, leafId, fn);
  const b = mapLeaf(node.b, leafId, fn);
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

export function splitLeaf(
  root: LayoutNode,
  leafId: string,
  dir: SplitDir,
  newKind: PanelKind,
): { root: LayoutNode; newLeaf: LeafNode | null } {
  if (!findLeaf(root, leafId)) return { root, newLeaf: null };
  const newLeaf = makeLeaf(newKind);
  const next = mapLeaf(root, leafId, (leaf) => ({
    type: "split",
    id: uid(),
    dir,
    ratio: 0.5,
    a: leaf,
    b: newLeaf,
  }));
  return { root: next, newLeaf };
}

/** Remove a leaf; its sibling replaces the parent split. The last leaf becomes `welcome`. */
export function closeLeaf(root: LayoutNode, leafId: string): LayoutNode {
  if (root.type === "leaf") return root.id === leafId ? makeLeaf("welcome") : root;
  if (root.a.type === "leaf" && root.a.id === leafId) return root.b;
  if (root.b.type === "leaf" && root.b.id === leafId) return root.a;
  const a = closeLeaf(root.a, leafId);
  const b = closeLeaf(root.b, leafId);
  return a === root.a && b === root.b ? root : { ...root, a, b };
}

export function setRatio(root: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (root.type === "leaf") return root;
  if (root.id === splitId) return { ...root, ratio: clampRatio(ratio) };
  const a = setRatio(root.a, splitId, ratio);
  const b = setRatio(root.b, splitId, ratio);
  return a === root.a && b === root.b ? root : { ...root, a, b };
}

export function swapLeaves(root: LayoutNode, idA: string, idB: string): LayoutNode {
  const leafA = findLeaf(root, idA);
  const leafB = findLeaf(root, idB);
  if (!leafA || !leafB || idA === idB) return root;
  const swap = (node: LayoutNode): LayoutNode => {
    if (node.type === "leaf") return node.id === idA ? leafB : node.id === idB ? leafA : node;
    const a = swap(node.a);
    const b = swap(node.b);
    return a === node.a && b === node.b ? node : { ...node, a, b };
  };
  return swap(root);
}

export function findLeaf(root: LayoutNode, leafId: string): LeafNode | null {
  if (root.type === "leaf") return root.id === leafId ? root : null;
  return findLeaf(root.a, leafId) ?? findLeaf(root.b, leafId);
}

/** Nearest ancestor split of `leafId` whose direction is `dir` (for ⌘⇧+arrow resize). */
export function findAncestorSplit(root: LayoutNode, leafId: string, dir: SplitDir): SplitNode | null {
  if (root.type === "leaf") return null;
  const inA = findLeaf(root.a, leafId) !== null;
  const inB = findLeaf(root.b, leafId) !== null;
  if (!inA && !inB) return null;
  const deeper = findAncestorSplit(inA ? root.a : root.b, leafId, dir);
  return deeper ?? (root.dir === dir ? root : null);
}

export function findSplit(root: LayoutNode, splitId: string): SplitNode | null {
  if (root.type === "leaf") return null;
  if (root.id === splitId) return root;
  return findSplit(root.a, splitId) ?? findSplit(root.b, splitId);
}

/** All leaves in visual (in-)order — the ⌘1..9 numbering. */
export function leaves(root: LayoutNode): LeafNode[] {
  if (root.type === "leaf") return [root];
  return [...leaves(root.a), ...leaves(root.b)];
}

export function replaceKind(
  root: LayoutNode,
  leafId: string,
  kind: PanelKind,
  params?: Record<string, string>,
): LayoutNode {
  return mapLeaf(root, leafId, (leaf) =>
    params ? { type: "leaf", id: leaf.id, kind, params } : { type: "leaf", id: leaf.id, kind },
  );
}

export function setLeafParams(root: LayoutNode, leafId: string, params: Record<string, string>): LayoutNode {
  return mapLeaf(root, leafId, (leaf) => ({ ...leaf, params }));
}

/**
 * Drag-rearrange (T8): drop leaf `srcId` onto leaf `dstId`.
 * Edge drops split the target in that direction; `center` swaps the leaves.
 */
export function moveLeaf(root: LayoutNode, srcId: string, dstId: string, edge: DropEdge): LayoutNode {
  const src = findLeaf(root, srcId);
  if (!src || srcId === dstId || !findLeaf(root, dstId)) return root;
  if (edge === "center") return swapLeaves(root, srcId, dstId);
  const without = closeLeaf(root, srcId);
  const dir: SplitDir = edge === "w" || edge === "e" ? "row" : "col";
  const first = edge === "w" || edge === "n";
  return mapLeaf(without, dstId, (dst) => ({
    type: "split",
    id: uid(),
    dir,
    ratio: 0.5,
    a: first ? src : dst,
    b: first ? dst : src,
  }));
}

/**
 * Map a pointer position (normalized 0..1 within the target panel) to a drop
 * edge: outer 25% bands split toward that edge, the middle swaps.
 */
export function dropEdgeAt(x: number, y: number): DropEdge {
  if (x < 0.25) return "w";
  if (x > 0.75) return "e";
  if (y < 0.25) return "n";
  if (y > 0.75) return "s";
  return "center";
}

// ── Presets (D-M2-1: ship focus / cockpit / monitor) ─────────────────────────

export type PresetName = "focus" | "cockpit" | "monitor";

export const PRESET_NAMES: readonly PresetName[] = ["focus", "cockpit", "monitor"];

export function buildPreset(name: PresetName): LayoutNode {
  switch (name) {
    case "focus":
      return makeLeaf("chat");
    case "cockpit":
      return {
        type: "split",
        id: uid(),
        dir: "row",
        ratio: 0.6,
        a: makeLeaf("chat"),
        b: {
          type: "split",
          id: uid(),
          dir: "col",
          ratio: 0.5,
          a: makeLeaf("sessions"),
          b: makeLeaf("activity"),
        },
      };
    case "monitor":
      return {
        type: "split",
        id: uid(),
        dir: "row",
        ratio: 0.5,
        a: makeLeaf("sessions"),
        b: makeLeaf("activity"),
      };
  }
}

// ── Persistence validation (corrupted JSON → caller falls back, never crash) ─

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isLayoutNode(v: unknown): v is LayoutNode {
  if (!isRecord(v) || typeof v.id !== "string") return false;
  if (v.type === "leaf")
    return typeof v.kind === "string" && (PANEL_KINDS as readonly string[]).includes(v.kind);
  if (v.type === "split")
    return (
      (v.dir === "row" || v.dir === "col") &&
      typeof v.ratio === "number" &&
      isLayoutNode(v.a) &&
      isLayoutNode(v.b)
    );
  return false;
}

function isWorkspaceTab(v: unknown): v is WorkspaceTab {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    (v.projectFilter === null || typeof v.projectFilter === "string") &&
    isLayoutNode(v.root)
  );
}

/** Parse the `workspace.tabs` settings value. Returns null on any corruption. */
export function parseTabs(json: string | null | undefined): WorkspaceTab[] | null {
  if (!json) return null;
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v) || v.length === 0 || !v.every(isWorkspaceTab)) return null;
    return v.map((t) => ({
      id: t.id,
      name: t.name,
      root: pruneNode(t.root),
      projectFilter: t.projectFilter,
    }));
  } catch {
    return null;
  }
}

/** Strip unknown extra fields so persisted state stays canonical. */
function pruneNode(n: LayoutNode): LayoutNode {
  if (n.type === "leaf")
    return n.params
      ? { type: "leaf", id: n.id, kind: n.kind, params: n.params }
      : { type: "leaf", id: n.id, kind: n.kind };
  return {
    type: "split",
    id: n.id,
    dir: n.dir,
    ratio: clampRatio(n.ratio),
    a: pruneNode(n.a),
    b: pruneNode(n.b),
  };
}
