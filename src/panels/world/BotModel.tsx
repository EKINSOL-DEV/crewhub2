// The boxy robot body (EKI-113): v1's beloved BotBody/BotFace ported as one
// static model — head + body rounded boxes, stubby capsule arms, dark feet,
// big eyes with blush, and v2's status-bulb antenna moved to the head top.
// Pure visuals: Bot3D owns every animation; the only part that moves here is
// the `eyesRef` group (Bot3D squints it via scale.y), so it sits AT eye height.
import type { Ref } from "react";
import { RoundedBox } from "@react-three/drei";
import type * as THREE from "three";
import { shadeHex } from "./lib/theme-palette";
import { toonGradientMap } from "./lib/toon";

// Proportions come from v1 (BotBody.tsx). The whole model shifts down so the
// feet rest on the floor while the group origin stays at BODY_Y (0.5) — a
// hair of clearance keeps the idle bob (±0.02) from sinking feet into it.
const MODEL_Y = -0.15; // feet bottom: -0.33 local → -0.48 → world 0.02
const EYE_X = 0.09;
const EYE_Y = 0.34; // slightly above head center (head center = 0.32)
const FACE_Z = 0.175; // just proud of the head front (depth 0.32 → z 0.16)

export interface BotModelProps {
  /** The bot's color — head, body and arms (band is a darker shade of it). */
  color: string;
  /** Blink target: Bot3D dips this group's scale.y to squint in place. */
  eyesRef: Ref<THREE.Group>;
  /** Status bulb on the antenna — color + final emissive intensity. */
  bulbColor: string;
  bulbIntensity: number;
}

export function BotModel({ color, eyesRef, bulbColor, bulbIntensity }: BotModelProps) {
  const gradient = toonGradientMap();
  const bandColor = shadeHex(color, -0.25);

  return (
    <group position={[0, MODEL_Y, 0]}>
      {/* Head */}
      <RoundedBox args={[0.36, 0.32, 0.32]} radius={0.07} smoothness={4} position={[0, 0.32, 0]} castShadow>
        <meshToonMaterial color={color} gradientMap={gradient} />
      </RoundedBox>
      {/* Body — slightly wider than the head */}
      <RoundedBox args={[0.4, 0.28, 0.34]} radius={0.06} smoothness={4} position={[0, -0.02, 0]} castShadow>
        <meshToonMaterial color={color} gradientMap={gradient} />
      </RoundedBox>
      {/* Lower band — darker base peeking out under the body */}
      <RoundedBox args={[0.4, 0.12, 0.34]} radius={0.04} smoothness={3} position={[0, -0.16, 0]}>
        <meshToonMaterial color={bandColor} gradientMap={gradient} />
      </RoundedBox>

      {/* Stubby capsule arms, tilted slightly outward */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * 0.26, 0, 0]} rotation={[0, 0, side * -0.2]}>
          <capsuleGeometry args={[0.04, 0.12, 6, 8]} />
          <meshToonMaterial color={color} gradientMap={gradient} />
        </mesh>
      ))}

      {/* Feet — small dark boxes, toes pointing forward */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * 0.09, -0.3, 0.03]}>
          <boxGeometry args={[0.1, 0.06, 0.13]} />
          <meshToonMaterial color="#2a2a2a" gradientMap={gradient} />
        </mesh>
      ))}

      {/* Eyes — white sclera + pupil + highlight; the wrapper sits at eye
          height so a blink (scale.y dip) squints in place, not slides down */}
      <group ref={eyesRef} position={[0, EYE_Y, FACE_Z]}>
        {([-1, 1] as const).map((side) => (
          <group key={side} position={[side * EYE_X, 0, 0]}>
            <mesh>
              <circleGeometry args={[0.065, 20]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
            <mesh position={[0, 0, 0.005]}>
              <circleGeometry args={[0.035, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
            </mesh>
            <mesh position={[0.015, 0.015, 0.01]}>
              <circleGeometry args={[0.012, 10]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Blush — just below and outside the eyes */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * 0.14, 0.28, 0.171]}>
          <circleGeometry args={[0.028, 12]} />
          <meshStandardMaterial color="#f0a0b0" roughness={0.6} />
        </mesh>
      ))}

      {/* Smile */}
      <mesh position={[0, 0.265, 0.172]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.05, 0.012, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#222831" roughness={0.5} />
      </mesh>

      {/* Antenna with the status-colored bulb (v2's best idea, kept) — now
          rooted in the head top so it still reads from across the room */}
      <mesh position={[0, 0.53, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.14, 6]} />
        <meshStandardMaterial color="#222831" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.63, 0]}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial color={bulbColor} emissive={bulbColor} emissiveIntensity={bulbIntensity} />
      </mesh>
    </group>
  );
}
