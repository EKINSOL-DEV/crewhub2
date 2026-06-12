// Cameras (EKI-71): orbit by default; first-person walking on demand.
// v1's CameraController/FirstPersonController concepts, rewritten lean:
// F (handled by WorldPanel) toggles modes, Esc / pointer-unlock returns to
// orbit, WASD (+shift run) walks at eye height clamped to the world bounds.
//
// Focus flights (EKI-116): selecting a room flies the camera to frame it;
// selecting a bot flies in close and keeps following while it wanders.
// Deselecting flies back to the overview framing.
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { readBotPose } from "./lib/bot-pose";
import type { WorldBounds } from "./lib/layout";

const EYE_HEIGHT = 1.5;
const WALK_SPEED = 4;
const RUN_SPEED = 8;

export type CameraMode = "orbit" | "fp";

/** What the camera should frame; null = free orbit where it stands. */
export type CameraFocus =
  | { kind: "zone"; center: [number, number]; size: number }
  | { kind: "bot"; key: string };

/** Camera offset from a followed bot — close enough to read its face. */
const FOLLOW_OFFSET = new THREE.Vector3(3.2, 3.4, 5.2);
/** Per-second damping rate for focus flights (exponential ease). */
const FLIGHT_RATE = 3.2;
/** Within this distance the flight is considered arrived. */
const ARRIVE_EPS = 0.15;

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

/** The default framing for a world of this footprint — the "← back" pose. */
function overviewPose(bounds: WorldBounds): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 18);
  // Close enough to stay well inside the fog band (starts at 45).
  return {
    pos: new THREE.Vector3(cx, span * 0.45 + 6, cz + span * 0.58 + 8),
    target: new THREE.Vector3(cx, 0, cz),
  };
}

function FocusOrbit({
  bounds,
  focus,
  enabled,
  reducedMotion,
}: {
  bounds: WorldBounds;
  focus: CameraFocus | null;
  enabled: boolean;
  reducedMotion: boolean;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls> | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  // Active flight destination; null = nothing to animate this frame.
  const flight = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  // While set, the controls target tracks this bot every frame (camera comes
  // along by translation, so user orbiting around the bot keeps working).
  const followKey = useRef<string | null>(null);
  const hadFocus = useRef(false);
  const overview = useMemo(() => overviewPose(bounds), [bounds]);

  useEffect(() => {
    if (focus?.kind === "zone") {
      const [cx, cz] = focus.center;
      const d = focus.size;
      flight.current = {
        pos: new THREE.Vector3(cx, d * 0.95 + 3.5, cz + d * 1.15 + 2.5),
        target: new THREE.Vector3(cx, 0.4, cz),
      };
      followKey.current = null;
      hadFocus.current = true;
    } else if (focus?.kind === "bot") {
      followKey.current = focus.key; // flight pose derives from the live pose
      flight.current = null;
      hadFocus.current = true;
    } else {
      followKey.current = null;
      // Only fly home if we had flown somewhere — never on mount.
      flight.current = hadFocus.current
        ? { pos: overview.pos.clone(), target: overview.target.clone() }
        : null;
      hadFocus.current = false;
    }
    invalidate();
  }, [focus, overview, invalidate]);

  useFrame((state, delta) => {
    const c = controls.current;
    if (!c) return;
    const cam = state.camera;
    const dt = Math.min(delta, 0.1);

    // Following a bot: re-aim the flight at its live position every frame.
    if (followKey.current) {
      const pose = readBotPose(followKey.current);
      if (pose) {
        flight.current = {
          target: new THREE.Vector3(pose[0], pose[1], pose[2]),
          pos: new THREE.Vector3(pose[0], pose[1], pose[2]).add(FOLLOW_OFFSET),
        };
      }
    }

    const f = flight.current;
    if (!f) return;

    if (reducedMotion) {
      cam.position.copy(f.pos);
      c.target.copy(f.target);
    } else {
      const k = 1 - Math.exp(-FLIGHT_RATE * dt);
      cam.position.lerp(f.pos, k);
      c.target.lerp(f.target, k);
    }
    c.update();
    state.invalidate();

    // One-shot flights end on arrival; follow flights never do.
    if (!followKey.current && cam.position.distanceTo(f.pos) < ARRIVE_EPS) {
      flight.current = null;
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={enabled}
      maxPolarAngle={Math.PI / 2.1}
      minDistance={2.5}
      maxDistance={60}
      enableDamping={false}
    />
  );
}

export function CameraRig({
  mode,
  bounds,
  onExitFp,
  orbitEnabled = true,
  focus = null,
  reducedMotion = false,
}: {
  mode: CameraMode;
  bounds: WorldBounds;
  onExitFp: () => void;
  /** Off while a prop drag is in flight (EKI-81) — the floor drag owns the pointer. */
  orbitEnabled?: boolean;
  /** Selected room/bot to frame (EKI-116); null = free orbit. */
  focus?: CameraFocus | null;
  reducedMotion?: boolean;
}) {
  if (mode === "fp") return <FirstPerson bounds={bounds} onExit={onExitFp} />;
  return <FocusOrbit bounds={bounds} focus={focus} enabled={orbitEnabled} reducedMotion={reducedMotion} />;
}
