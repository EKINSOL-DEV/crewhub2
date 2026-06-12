// One bot = one live session (EKI-62/66). v1's visual DNA, now fully restored
// (EKI-113): the boxy robot body lives in BotModel; this file owns the motion.
// All of it folds pure step functions (wanderStep/springStep/squashStretch/
// blinkScale) — and is skipped entirely under reduced motion (static variants).
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { BotBubbles } from "./BotBubbles";
import { BotModel } from "./BotModel";
import type { WorldBot } from "./lib/bots";
import type { WorldBounds } from "./lib/layout";
import { blinkScale, squashStretch } from "./lib/motion";
import { springStep, type Spring1D } from "./lib/spring";
import { statusGlow } from "./lib/status";
import { initialWander, wanderStep, type WanderState } from "./lib/wander";

const BODY_Y = 0.5; // robot group origin height — BotModel puts feet on the floor
const HOME_SPEED = 1.6; // hustle back to the desk faster than a stroll
const MOVE_OMEGA = 7; // spring snappiness — eased starts/stops, no overshoot
const HOP_AMPLITUDE = 0.14;

function phaseOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 628) / 100; // 0..2π — desynchronize the bobbing
}

/** Shortest-arc Y rotation easing (v1 smoothRotateY, trimmed). */
function easeRotationY(group: THREE.Group, target: number, lerp = 0.15): void {
  let diff = target - group.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  group.rotation.y += Math.abs(diff) < 0.01 ? diff : diff * lerp;
}

export interface Bot3DProps {
  bot: WorldBot;
  /** Home slot [x, z] from assignHomes. */
  home: [number, number];
  /** Wander area (inner bounds of the bot's room). */
  bounds: WorldBounds;
  reducedMotion: boolean;
  /** Fresh AssistantText to show in a speech bubble (null = quiet). */
  speech?: string | null | undefined;
  onClick?: ((bot: WorldBot, e: ThreeEvent<MouseEvent>) => void) | undefined;
}

export function Bot3D({ bot, home, bounds, reducedMotion, speech, onClick }: Bot3DProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const wander = useRef<WanderState>(initialWander(home[0], home[1]));
  // Rendered position springs toward the wander target — eased starts/stops.
  const springX = useRef<Spring1D>({ x: home[0], v: 0 });
  const springZ = useRef<Spring1D>({ x: home[1], v: 0 });
  const phase = useMemo(() => phaseOf(bot.key), [bot.key]);
  const glow = statusGlow(bot.status);

  // Room/binding changed → walk to the new home instead of teleporting.
  useEffect(() => {
    wander.current = { ...wander.current, targetX: home[0], targetZ: home[1], waitS: 0 };
  }, [home]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    if (reducedMotion) {
      g.position.set(home[0], BODY_Y, home[1]);
      g.rotation.y = 0;
      if (body.current) body.current.scale.set(1, 1, 1);
      if (eyes.current) eyes.current.scale.set(1, 1, 1);
      springX.current = { x: home[0], v: 0 };
      springZ.current = { x: home[1], v: 0 };
      return;
    }

    const dt = Math.min(delta, 0.1); // tab-back jumps shouldn't teleport bots
    const s = wander.current;
    const next =
      bot.status === "Idle"
        ? wanderStep(s, dt, bounds, Math.random)
        : wanderStep(
            { ...s, targetX: home[0], targetZ: home[1], waitS: 2 },
            dt,
            bounds,
            Math.random,
            HOME_SPEED,
          );
    wander.current = next;

    // Spring-ease the rendered position toward the wander step (Epic 20):
    // critically damped, so departures lean in and arrivals settle softly.
    springX.current = springStep(springX.current, next.x, MOVE_OMEGA, dt);
    springZ.current = springStep(springZ.current, next.z, MOVE_OMEGA, dt);

    const t = state.clock.elapsedTime + phase;
    // WaitingForPermission hops for attention (the 3D cousin of the 🙋 critter).
    const bob =
      glow.anim === "bounce"
        ? Math.abs(Math.sin(t * 5)) * HOP_AMPLITUDE
        : next.moving
          ? Math.abs(Math.sin(t * 8)) * 0.05
          : Math.sin(t * 1.6) * 0.02;
    g.position.set(springX.current.x, BODY_Y + bob, springZ.current.x);

    if (next.moving) easeRotationY(g, next.heading);
    else easeRotationY(g, 0, 0.05); // settle facing the camera side

    if (body.current) {
      // Working bots do a tiny eager wiggle — the 3D cousin of the 🔨 critter.
      body.current.rotation.z = bot.status === "Working" ? Math.sin(t * 12) * 0.04 : 0;
      // The hop gets cartoon squash-and-stretch; everyone else stands firm.
      if (glow.anim === "bounce") {
        const s = squashStretch(bob / HOP_AMPLITUDE);
        body.current.scale.set(s.xz, s.y, s.xz);
      } else {
        body.current.scale.set(1, 1, 1);
      }
    }

    // Occasional blink — deterministic, phase-desynchronized across bots.
    if (eyes.current) eyes.current.scale.y = blinkScale(state.clock.elapsedTime, phase);

    // Working glow breathes; everything else holds steady.
    if (glowMat.current) {
      const base = glow.intensity * 0.55;
      glowMat.current.opacity = glow.anim === "pulse" ? base * (0.7 + 0.3 * Math.sin(t * 4)) : base;
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick?.(bot, e);
  };

  const scale = bot.isSubagent ? 0.7 : 1;

  return (
    <group ref={group} position={[home[0], BODY_Y, home[1]]} scale={scale}>
      <group ref={body} onClick={handleClick}>
        {/* The boxy robot — static body; squash/wiggle scale this wrapper */}
        <BotModel
          color={bot.color}
          eyesRef={eyes}
          bulbColor={glow.color}
          bulbIntensity={glow.intensity * 1.5}
        />
      </group>

      {/* Status glow ring at the feet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -BODY_Y + 0.08, 0]}>
        <ringGeometry args={[0.3, 0.46, 24]} />
        <meshBasicMaterial
          ref={glowMat}
          color={glow.color}
          transparent
          opacity={glow.intensity * 0.55}
          depthWrite={false}
        />
      </mesh>

      <BotBubbles bot={bot} speech={speech ?? null} />

      {/* Name — always camera-facing, subagents get smaller type */}
      <Billboard position={[0, 0.85, 0]}>
        <Text
          fontSize={bot.isSubagent ? 0.16 : 0.2}
          color="#eef1f8"
          outlineWidth={0.012}
          outlineColor="#15171c"
          anchorX="center"
          anchorY="bottom"
          maxWidth={3}
        >
          {bot.name}
        </Text>
      </Billboard>
    </group>
  );
}
