/* Label layout on screen (TownScene.placeLabels): hanging labels keep off each other, off room signs and off the
   entered building's robots. Pure: boxes in CSS pixels in, positions out; no Three.js, no DOM. */

/* Pixels between two hanging labels before the one further back moves up. */
export const LABEL_GAP = 3;

export interface Label {
  el: HTMLElement;
  id: string;
  /** Half the width and the height of the label's box, measured when React renders it. */
  half: number;
  height: number;
  /** A hanging label (a robot's pill and bubble, a tag), which keeps clear of its neighbours. */
  stack: boolean;
  /** A room sign: it keeps its place, and hanging labels keep clear of it. */
  sign: boolean;
  /** A robot's own stack (name pill, bubble): it stays just over its robot's head. */
  robot: boolean;
  /** The hovered or selected robot's plate: placed first, never faded or hidden. */
  picked: boolean;
  /** The agent card (`card:<slug>:<key>`): beside its figure, kept whole on screen, never nudged or faded. */
  card: boolean;
  /** The visibility last written to the element. */
  shown: boolean;
  /** The anchor's screen y this frame, before nudging. */
  ay: number;
  /** Faded: pushed far from its anchor (class label-far). A room sign over a robot or its stack (class label-yield). */
  far: boolean;
  yields: boolean;
  /** Placed position, and this frame's position before it is applied. */
  x: number;
  y: number;
  nx: number;
  ny: number;
  visible: boolean;
}

/** A robot on screen: its centre x and its box from just over its head to its feet. */
export interface RobotBox {
  id: string;
  x: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const overlaps = (l: Label, left: number, right: number, top: number, bottom: number) =>
  l.nx + l.half + LABEL_GAP > left && l.nx - l.half - LABEL_GAP < right && l.ny + LABEL_GAP > top && l.ny - l.height - LABEL_GAP < bottom;

/** A room sign's box (from 10 % of its width left of its anchor, centred on it vertically: world.css) over a robot or
    a robot's own stack. */
export function overRobot(s: Label, stacks: readonly Label[], robots: readonly RobotBox[], count: number): boolean {
  const left = s.nx - s.half * 0.2,
    right = left + s.half * 2,
    top = s.ny - s.height / 2,
    bottom = s.ny + s.height / 2;
  for (let i = 0; i < count; i++) {
    const r = robots[i]!;
    if (right > r.left && left < r.right && bottom > r.top && top < r.bottom) return true;
  }
  for (const l of stacks) if (l.robot && l.visible && right > l.nx - l.half && left < l.nx + l.half && bottom > l.ny - l.height && top < l.ny) return true;
  return false;
}

/**
 * Hanging labels keep off each other, off room signs and off the robots, so a robot is never hidden behind labels.
 * - The hovered or selected robot's plate goes first, then robots' own stacks (name pill, bubble), each just over its
 *   robot's head; from the front of the scene (lowest on screen) back, one that would overlap a stack already placed
 *   moves up above it. A robot's stack pays other robots no heed (moving it would take it from its own robot).
 * - Then the other hanging labels (desk tags, rule chips, ticket chips) from the front back: one that would cover a
 *   robot or a robot's stack steps aside, to the side its anchor is on; one that would overlap another placed label or
 *   a room sign moves up above it.
 * - A room sign keeps its place; robots' stacks pay it no heed, and it steps back instead (placeLabels: label-yield).
 */
export function nudgeStacks(stacks: Label[], signs: readonly Label[], robots: readonly RobotBox[], count: number) {
  // The picked robot's plate first, then robots' stacks, then the rest; each group from the front of the scene back.
  const rank = (l: Label) => (l.picked ? 0 : l.robot ? 1 : 2);
  stacks.sort((a, b) => rank(a) - rank(b) || b.ny - a.ny || (a.id < b.id ? -1 : 1));
  for (let i = 0; i < stacks.length; i++) {
    const l = stacks[i]!;
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      // Sideways first: a desk label over a robot steps to the side of the robot its anchor is on. A robot's own stack
      // pays other robots no heed: moving it would only take it away from its own robot.
      if (!l.robot)
        for (let k = 0; k < count; k++) {
          const r = robots[k]!;
          if (!overlaps(l, r.left, r.right, r.top, r.bottom)) continue;
          l.nx = l.nx < r.x ? r.left - l.half - LABEL_GAP : r.right + l.half + LABEL_GAP;
          moved = true;
        }
      for (let j = 0; j < i; j++) {
        const o = stacks[j]!;
        if (Math.abs(l.nx - o.nx) < l.half + o.half + LABEL_GAP && l.ny > o.ny - o.height - LABEL_GAP && l.ny - l.height < o.ny + LABEL_GAP) {
          // A desk's label meeting a robot's stack steps aside like it does for the robot; otherwise the one further
          // back moves up.
          if (o.robot && !l.robot) l.nx = l.nx < o.nx ? o.nx - o.half - l.half - LABEL_GAP : o.nx + o.half + l.half + LABEL_GAP;
          else l.ny = o.ny - o.height - LABEL_GAP;
          moved = true;
        }
      }
      if (!l.robot)
        for (const s of signs) {
          const left = s.nx - s.half * 0.2,
            top = s.ny - s.height / 2;
          if (overlaps(l, left, left + s.half * 2, top, s.ny + s.height / 2)) {
            l.ny = top - LABEL_GAP;
            moved = true;
          }
        }
      if (!moved) break;
    }
  }
}
