/* Label layout on screen (TownScene.placeLabels): hanging labels keep off each other, off room signs and off the
   entered building's robots, and every label keeps out of the fixed UI's boxes (the corners, the camera toolbar, the
   playback bar). Pure: boxes in CSS pixels in, positions out; no Three.js, no DOM. */

/* Pixels between two hanging labels before the one further back moves up. */
export const LABEL_GAP = 3;

export interface Label {
  el: HTMLElement;
  id: string;
  /** Half the width and the height of the label's box, measured when React renders it. */
  half: number;
  height: number;
  /**
   * The box's left and top from the anchor point, measured with the size: the label kind's CSS transform. A hanging
   * label sits at (-half, -height), a room sign at (-0.2 half, -height / 2), a rack sign hangs, a town sign stands
   * just under its anchor.
   */
  ox: number;
  oy: number;
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

/** A box on screen in CSS pixels. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A hanging label's box (bottom centred on its anchor) over a box. */
const overlaps = (l: Label, left: number, right: number, top: number, bottom: number) =>
  l.nx + l.half + LABEL_GAP > left && l.nx - l.half - LABEL_GAP < right && l.ny + LABEL_GAP > top && l.ny - l.height - LABEL_GAP < bottom;

/** Any label's box, from its measured offset: a room sign beside its anchor, a rack sign hanging over its rail. */
const box = (l: Label, out: Rect): Rect => {
  out.left = l.nx + l.ox;
  out.right = out.left + l.half * 2;
  out.top = l.ny + l.oy;
  out.bottom = out.top + l.height;
  return out;
};
const signBox: Rect = { left: 0, right: 0, top: 0, bottom: 0 };
const ownBox: Rect = { left: 0, right: 0, top: 0, bottom: 0 };

/** A room sign's box over a robot or a robot's own stack. */
export function overRobot(s: Label, stacks: readonly Label[], robots: readonly RobotBox[], count: number): boolean {
  const { left, right, top, bottom } = box(s, signBox);
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
 * - A room sign keeps its place (a rack's sign over its rail as much as a hall's sign beside its anchor); robots'
 *   stacks pay it no heed, and it steps back instead (placeLabels: label-yield).
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
          const { left, right, top, bottom } = box(s, signBox);
          if (overlaps(l, left, right, top, bottom)) {
            l.ny = top - LABEL_GAP;
            moved = true;
          }
        }
      if (!moved) break;
    }
  }
}

/**
 * Keeps a label out of the fixed UI's boxes (`chrome`: the corners, the camera toolbar, the playback bar, in the
 * canvas's pixels). A label whose box would sit under one moves the shortest way out of it that keeps the box on the
 * canvas (`width` x `height`): sideways from the toolbar's column, down from the top corners. One that fits nowhere
 * stays where it is. Returns true when the label moved.
 */
export function keepOffChrome(l: Label, chrome: readonly Rect[], width: number, height: number): boolean {
  let moved = false;
  for (let pass = 0; pass < 2; pass++) {
    let hit = false;
    for (const c of chrome) {
      const b = box(l, ownBox);
      if (b.right + LABEL_GAP <= c.left || b.left - LABEL_GAP >= c.right || b.bottom + LABEL_GAP <= c.top || b.top - LABEL_GAP >= c.bottom) continue;
      const w = b.right - b.left,
        h = b.bottom - b.top;
      // The four ways out, each as the shift of the anchor, kept to those that leave the box on the canvas.
      let best = 0,
        bestX = 0,
        bestY = 0;
      const consider = (dx: number, dy: number) => {
        const left = b.left + dx,
          top = b.top + dy;
        if (left < 0 || left + w > width || top < 0 || top + h > height) return;
        const d = Math.abs(dx) + Math.abs(dy);
        if (!best || d < best) {
          best = d;
          bestX = dx;
          bestY = dy;
        }
      };
      consider(c.left - LABEL_GAP - b.right, 0);
      consider(c.right + LABEL_GAP - b.left, 0);
      consider(0, c.top - LABEL_GAP - b.bottom);
      consider(0, c.bottom + LABEL_GAP - b.top);
      if (!best) continue;
      l.nx += bestX;
      l.ny += bestY;
      moved = hit = true;
    }
    if (!hit) break;
  }
  return moved;
}

/**
 * After the nudge: every stack out from under the chrome again. One that the chrome sends back onto a room sign (up
 * was its way off the sign, and the corner sits there) hangs below the sign instead.
 */
export function keepStacksOffChrome(stacks: readonly Label[], signs: readonly Label[], chrome: readonly Rect[], width: number, height: number) {
  for (const l of stacks) {
    if (!keepOffChrome(l, chrome, width, height)) continue;
    for (const s of signs) {
      const { left, right, top, bottom } = box(s, signBox);
      if (overlaps(l, left, right, top, bottom)) l.ny = bottom + l.height + LABEL_GAP;
    }
  }
}
