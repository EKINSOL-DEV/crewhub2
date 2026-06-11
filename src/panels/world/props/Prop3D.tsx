// One placed prop (EKI-81): a registry definition rendered part-by-part.
// Dumb on purpose — geometry from the part list, colors from the resolved
// role map, transform from the placement. Edit affordances (hover lift,
// selection ring) only appear in edit mode; hover is skipped entirely under
// reduced motion.
import { useState } from "react";
import { Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { PlacedProp } from "./placement";
import { resolveProp, type PropColorRole, type PropPart } from "./registry";

const SEGMENTS = 12;

function PartMesh({ part, color }: { part: PropPart; color: string }) {
  const s = part.size;
  return (
    <mesh position={[...part.at]} rotation-y={part.rotY ?? 0}>
      {part.shape === "box" && <boxGeometry args={[s[0]!, s[1]!, s[2]!]} />}
      {part.shape === "cylinder" && <cylinderGeometry args={[s[0]!, s[1]!, s[2]!, SEGMENTS]} />}
      {part.shape === "sphere" && <sphereGeometry args={[s[0]!, SEGMENTS, SEGMENTS]} />}
      {part.shape === "cone" && <coneGeometry args={[s[0]!, s[1]!, SEGMENTS]} />}
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

export interface Prop3DProps {
  placed: PlacedProp;
  /** World position of the prop origin (zone center + room-local offset). */
  position: [number, number, number];
  /** Resolved role → hex map (registry.propColors of the live palette). */
  colors: Record<PropColorRole, string>;
  /** Edit mode: pointer affordances on. */
  editable?: boolean;
  selected?: boolean;
  reducedMotion?: boolean;
  selectionColor?: string;
  onPointerDown?: ((placed: PlacedProp, e: ThreeEvent<PointerEvent>) => void) | undefined;
}

export function Prop3D({
  placed,
  position,
  colors,
  editable = false,
  selected = false,
  reducedMotion = false,
  selectionColor = "#ffffff",
  onPointerDown,
}: Prop3DProps) {
  const def = resolveProp(placed.propId);
  const unknown = def.id !== placed.propId;
  const marker = placed.marker ?? (unknown ? "📦" : null);
  const [hovered, setHovered] = useState(false);
  // Gentle lift on hover — never under reduced motion.
  const lift = editable && hovered && !reducedMotion ? 1.05 : 1;

  // exactOptionalPropertyTypes: only attach handlers when editing.
  const editHandlers = editable
    ? {
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onPointerDown?.(placed, e);
        },
        onPointerOver: () => setHovered(true),
        onPointerOut: () => setHovered(false),
      }
    : {};

  return (
    <group position={position} rotation-y={placed.rot} scale={placed.scale * lift} {...editHandlers}>
      {def.parts.map((part, i) => (
        <PartMesh key={i} part={part} color={colors[part.color]} />
      ))}

      {marker && (
        <Text position={[0, 1.2, 0]} fontSize={0.4} anchorX="center" anchorY="middle">
          {marker}
        </Text>
      )}

      {selected && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
          <ringGeometry args={[def.radius + 0.12, def.radius + 0.22, 32]} />
          <meshBasicMaterial color={selectionColor} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}
