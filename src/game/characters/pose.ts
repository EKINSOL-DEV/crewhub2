// Robot pose math (M1 T3) — pure, deterministic in t. The renderer applies
// these to RobotHandles every frame; the sim only picks the Motion.

export type Motion =
  | "stand"
  | "walk"
  | "sit-type"
  | "raise-hand"
  | "think"
  | "sad"
  | "dance"
  | "spin"
  | "cheer"
  | "wave";

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
    // Emote motions (M7 T2), triggered by Sim.command — all play in place.
    case "dance": {
      const s = Math.sin(t * 8);
      return {
        ...REST,
        bodyY: Math.abs(Math.sin(t * 8)) * 0.12,
        armL: s * 1.2,
        armR: -s * 1.2,
        headTiltZ: Math.sin(t * 4) * 0.1,
        blink,
      };
    }
    case "spin":
      // The 2-full-turn yaw itself is driven by the sim writing bot.facing
      // directly (see sim.ts's tickOverride) — this just holds a "twirling"
      // arm silhouette for the duration.
      return { ...REST, armL: -0.9, armR: 0.9, bodyY: 0.03, blink };
    case "cheer": {
      const hop = Math.abs(Math.sin(t * 7));
      return { ...REST, bodyY: hop * 0.18, armL: -2.8, armR: -2.8, headNodX: -0.1, blink };
    }
    case "wave": {
      // Distinct from raise-hand: lower arm angle, wider/slower swing —
      // reads as a friendly wave rather than a hand held up for permission.
      const swing = Math.sin(t * 5) * 0.35;
      return { ...REST, armR: -1.6 + swing, headNodX: -0.05, bodyY: Math.abs(Math.sin(t * 5)) * 0.02, blink };
    }
    case "stand":
    default:
      return { ...REST, bodyY: Math.sin(t * 2.2) * 0.015, blink };
  }
}
