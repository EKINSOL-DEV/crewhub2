// Cameras (EKI-71): orbit by default; first-person walking on demand.
// v1's CameraController/FirstPersonController concepts, rewritten lean:
// F (handled by WorldPanel) toggles modes, Esc / pointer-unlock returns to
// orbit, WASD (+shift run) walks at eye height clamped to the world bounds.
import { useEffect, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import type { WorldBounds } from "./lib/layout";

const EYE_HEIGHT = 1.5;
const WALK_SPEED = 4;
const RUN_SPEED = 8;

export type CameraMode = "orbit" | "fp";

const KEYMAP: Record<string, keyof Keys> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

interface Keys {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
}

function FirstPerson({ bounds, onExit }: { bounds: WorldBounds; onExit: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<ComponentRef<typeof PointerLockControls> | null>(null);
  const keys = useRef<Keys>({ forward: false, backward: false, left: false, right: false, run: false });
  const dir = useRef(new THREE.Vector3());
  const grounded = useRef(false); // drop to eye height on the first frame

  // Entering FP from the F key — a user gesture, so we may lock right away.
  // (Clicking the canvas re-locks too, drei's default fallback.)
  useEffect(() => {
    controls.current?.lock();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = KEYMAP[e.code];
      if (k) keys.current[k] = true;
      keys.current.run = e.shiftKey;
      invalidate(); // wake demand-mode frameloops
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYMAP[e.code];
      if (k) keys.current[k] = false;
      keys.current.run = e.shiftKey;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [invalidate]);

  // Camera is mutated via the frame-state parameter (not a hook return) —
  // the imperative escape hatch R3F is built around.
  useFrame((state, delta) => {
    const cam = state.camera;
    if (!grounded.current) {
      cam.position.y = EYE_HEIGHT;
      grounded.current = true;
    }
    const k = keys.current;
    const x = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const z = (k.backward ? 1 : 0) - (k.forward ? 1 : 0);
    if (x === 0 && z === 0) return;

    dir.current.set(x, 0, z).normalize().applyQuaternion(cam.quaternion);
    dir.current.y = 0;
    if (dir.current.lengthSq() < 1e-6) return;
    dir.current.normalize();

    const speed = (k.run ? RUN_SPEED : WALK_SPEED) * Math.min(delta, 0.1);
    cam.position.x = Math.min(bounds.maxX, Math.max(bounds.minX, cam.position.x + dir.current.x * speed));
    cam.position.z = Math.min(bounds.maxZ, Math.max(bounds.minZ, cam.position.z + dir.current.z * speed));
    cam.position.y = EYE_HEIGHT;
    state.invalidate();
  });

  // Esc releases the pointer lock → drei fires onUnlock → back to orbit.
  return <PointerLockControls ref={controls} makeDefault onUnlock={onExit} />;
}

export function CameraRig({
  mode,
  bounds,
  onExitFp,
}: {
  mode: CameraMode;
  bounds: WorldBounds;
  onExitFp: () => void;
}) {
  if (mode === "fp") return <FirstPerson bounds={bounds} onExit={onExitFp} />;
  return (
    <OrbitControls
      makeDefault
      maxPolarAngle={Math.PI / 2.1}
      minDistance={4}
      maxDistance={60}
      enableDamping={false}
    />
  );
}
