// One bot = one live session (EKI-62/66). v1's visual DNA, rewritten lean:
// rounded capsule body, simple face, gentle bobbing, idle wander. All motion
// folds the pure wanderStep — and is skipped entirely under reduced motion.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import type { WorldBot } from "./lib/bots";
import type { WorldBounds } from "./lib/layout";
import { initialWander, wanderStep, type WanderState } from "./lib/wander";

const BODY_Y = 0.5; // capsule center height — feet on the floor
const HOME_SPEED = 1.6; // hustle back to the desk faster than a stroll

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
  onClick?: ((bot: WorldBot, e: ThreeEvent<MouseEvent>) => void) | undefined;
}

export function Bot3D({ bot, home, bounds, reducedMotion, onClick }: Bot3DProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const wander = useRef<WanderState>(initialWander(home[0], home[1]));
  const phase = useMemo(() => phaseOf(bot.key), [bot.key]);

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

    const t = state.clock.elapsedTime + phase;
    const bob = next.moving ? Math.abs(Math.sin(t * 8)) * 0.05 : Math.sin(t * 1.6) * 0.02;
    g.position.set(next.x, BODY_Y + bob, next.z);

    if (next.moving) easeRotationY(g, next.heading);
    else easeRotationY(g, 0, 0.05); // settle facing the camera side

    // Working bots do a tiny eager wiggle — the 3D cousin of the 🔨 critter.
    if (body.current) body.current.rotation.z = bot.status === "Working" ? Math.sin(t * 12) * 0.04 : 0;
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick?.(bot, e);
  };

  const scale = bot.isSubagent ? 0.7 : 1;

  return (
    <group ref={group} position={[home[0], BODY_Y, home[1]]} scale={scale}>
      <group ref={body} onClick={handleClick}>
        {/* Rounded capsule body */}
        <mesh>
          <capsuleGeometry args={[0.24, 0.4, 6, 16]} />
          <meshStandardMaterial color={bot.color} roughness={0.55} />
        </mesh>
        {/* Eyes — white sclera + pupil, embedded in the head front */}
        {[-0.09, 0.09].map((x) => (
          <group key={x} position={[x, 0.18, 0.17]}>
            <mesh>
              <sphereGeometry args={[0.055, 12, 12]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
            <mesh position={[0, 0, 0.038]}>
              <sphereGeometry args={[0.026, 10, 10]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
            </mesh>
          </group>
        ))}
        {/* Smile */}
        <mesh position={[0, 0.06, 0.215]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.05, 0.012, 6, 12, Math.PI]} />
          <meshStandardMaterial color="#222831" roughness={0.5} />
        </mesh>
      </group>

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
