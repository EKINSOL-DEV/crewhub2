// Robot pose math (M1 T3) — pure, deterministic in t. The renderer applies
// these to RobotHandles every frame; the sim only picks the Motion.

export type Motion = "stand" | "walk" | "sit-type" | "raise-hand" | "think" | "sad";

export interface Pose {
  bodyY: number;
  bodyTiltX: number;
  headNodX: number;
  headTiltZ: number;
  armL: number;
  armR: number;
  blink: boolean;
}

const REST: Pose = { bodyY: 0, bodyTiltX: 0, headNodX: 0, headTiltZ: 0, armL: 0, armR: 0, blink: false };

/** Blink ~ every 3.4s for 0.12s — same rhythm for every motion. */
function blinkAt(t: number): boolean {
  return t % 3.4 < 0.12;
}

export function pose(motion: Motion, t: number): Pose {
  const blink = blinkAt(t);
  switch (motion) {
    case "walk": {
      const s = Math.sin(t * 9);
      return { ...REST, bodyY: Math.abs(Math.sin(t * 9)) * 0.055, armL: s * 0.55, armR: -s * 0.55, blink };
    }
    case "sit-type": {
      const tap = Math.sin(t * 13) * 0.09;
      return {
        ...REST,
        bodyY: -0.24,
        armL: -0.95 + tap,
        armR: -0.95 - tap,
        headNodX: 0.12,
        blink,
      };
    }
    case "raise-hand": {
      const wave = Math.sin(t * 6) * 0.12;
      return { ...REST, bodyY: Math.abs(Math.sin(t * 6)) * 0.03, armR: -2.7 + wave, headNodX: -0.08, blink };
    }
    case "think":
      return { ...REST, headTiltZ: Math.sin(t * 1.1) * 0.16, armR: -1.7, headNodX: -0.05, blink };
    case "sad":
      return { ...REST, bodyTiltX: 0.18, headNodX: 0.24, bodyY: -0.05, blink };
    case "stand":
    default:
      return { ...REST, bodyY: Math.sin(t * 2.2) * 0.015, blink };
  }
}
