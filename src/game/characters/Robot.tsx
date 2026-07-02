// The CrewHub robot (M1 T2) — the boxy v1 mascot rebuilt for the campus:
// rounded-box head/body, big eyes, blush, antenna bulb. Parts are exposed
// through `handles` so the animator (per frame) never touches React.
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { toonGradientMap } from "@/game/engine/toon";

export interface RobotHandles {
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  eyes: THREE.Group;
  bulb: THREE.MeshToonMaterial;
}

const EYE_WHITE = "#ffffff";
const PUPIL = "#1f2430";
const BLUSH = "#f9a8d4";
const FEET = "#2a2f3a";

export function Robot({
  color,
  bulbColor,
  handles,
}: {
  color: string;
  bulbColor: string;
  handles?: MutableRefObject<RobotHandles | null>;
}) {
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const bulb = useRef<THREE.MeshToonMaterial>(null);
  // React Compiler's ref-mutation check only recognizes bindings named
  // `*Ref` as mutable refs — alias the prop so `.current = …` below isn't
  // flagged as a prop mutation (it's genuinely a MutableRefObject).
  const handlesRef = handles;

  useEffect(() => {
    if (!handlesRef) return;
    if (body.current && head.current && armL.current && armR.current && eyes.current && bulb.current) {
      handlesRef.current = {
        body: body.current,
        head: head.current,
        armL: armL.current,
        armR: armR.current,
        eyes: eyes.current,
        bulb: bulb.current,
      };
    }
    return () => {
      if (handlesRef) handlesRef.current = null;
    };
  }, [handlesRef]);

  const grad = toonGradientMap();
  return (
    <group ref={body}>
      {/* feet */}
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.09, 0]} castShadow>
          <boxGeometry args={[0.22, 0.18, 0.3]} />
          <meshToonMaterial color={FEET} gradientMap={grad} />
        </mesh>
      ))}
      {/* body with darker lower band */}
      <RoundedBox args={[0.66, 0.62, 0.46]} radius={0.09} position={[0, 0.52, 0]} castShadow>
        <meshToonMaterial color={color} gradientMap={grad} />
      </RoundedBox>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[0.6, 0.14, 0.4]} />
        <meshToonMaterial color={new THREE.Color(color).multiplyScalar(0.72)} gradientMap={grad} />
      </mesh>
      {/* arms — pivot groups at the shoulders */}
      <group ref={armL} position={[-0.4, 0.74, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.26, 4, 8]} />
          <meshToonMaterial color={color} gradientMap={grad} />
        </mesh>
      </group>
      <group ref={armR} position={[0.4, 0.74, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.26, 4, 8]} />
          <meshToonMaterial color={color} gradientMap={grad} />
        </mesh>
      </group>
      {/* head */}
      <group ref={head} position={[0, 1.12, 0]}>
        <RoundedBox args={[0.58, 0.5, 0.5]} radius={0.1} castShadow>
          <meshToonMaterial color={color} gradientMap={grad} />
        </RoundedBox>
        <group ref={eyes} position={[0, 0.04, 0.26]}>
          {[-0.13, 0.13].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh>
                <sphereGeometry args={[0.075, 12, 10]} />
                <meshToonMaterial color={EYE_WHITE} gradientMap={grad} />
              </mesh>
              <mesh position={[0, 0, 0.05]}>
                <sphereGeometry args={[0.035, 10, 8]} />
                <meshToonMaterial color={PUPIL} gradientMap={grad} />
              </mesh>
            </group>
          ))}
        </group>
        {/* blush */}
        {[-0.21, 0.21].map((x) => (
          <mesh key={x} position={[x, -0.08, 0.255]}>
            <circleGeometry args={[0.05, 10]} />
            <meshToonMaterial color={BLUSH} gradientMap={grad} />
          </mesh>
        ))}
        {/* smile */}
        <mesh position={[0, -0.13, 0.26]} rotation-z={Math.PI}>
          <torusGeometry args={[0.07, 0.016, 6, 12, Math.PI]} />
          <meshToonMaterial color={PUPIL} gradientMap={grad} />
        </mesh>
        {/* antenna + status bulb */}
        <mesh position={[0, 0.34, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.18, 6]} />
          <meshToonMaterial color={FEET} gradientMap={grad} />
        </mesh>
        <mesh position={[0, 0.46, 0]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshToonMaterial
            ref={bulb}
            color={bulbColor}
            emissive={bulbColor}
            emissiveIntensity={0.7}
            gradientMap={grad}
          />
        </mesh>
      </group>
    </group>
  );
}
