/* The soft Greenhouse robot (moved from models.ts) with its posture rig. Postures are still poses plus a small idle
   motion in `update`; the caller skips `update` under reduced motion. */
import * as THREE from "three";
import type { PaletteName, RobotDetail, RobotHandle, RobotPosture, RobotRole } from "@crewhub/world-style";
import { put, type Kit } from "./kit.ts";
import { haloMaterial } from "./shaders.ts";

const WORKER_COLORS = ["bot-sage", "bot-apricot", "bot-lavender"];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function robot(kit: Kit, options: { key: string; accent: PaletteName | null; role: RobotRole }): RobotHandle {
  // A lead wears its project's colour as a soft tint, so it sits with the sage, apricot and lavender workers.
  const color = options.role === "lead" && options.accent ? `soft:${options.accent}` : WORKER_COLORS[hash(options.key) % 3]!;
  const variant = options.role === "design" ? 1 : options.role === "analyst" || options.role === "router" ? 2 : 0;
  const group = new THREE.Group(),
    body = new THREE.Group(),
    head = new THREE.Group();
  const halo = haloMaterial(kit.hex(color));
  const ring = new THREE.Mesh(kit.geometry("halo", () => new THREE.PlaneGeometry(1.45, 1.45)), halo);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  // A soft blob under the feet in every quality setting: the robot stands on the floor even without shadow maps.
  const blob = kit.decal("shadow", 0.2, 0.16, 0.3);
  blob.position.y = 0.015;
  group.add(blob, ring, body);
  body.position.y = 0.12;
  // Small parts: seen from the town ("far") they are dropped, with every shadow.
  const fine: THREE.Object3D[] = [];
  const small = <T extends THREE.Object3D>(o: T): T => (fine.push(o), o);
  put(body, kit.box(0.5, 0.43, 0.36, color, 0.1), 0, 0.46, 0);
  small(put(body, kit.box(0.25, 0.15, 0.025, "badge", 0.035), 0, 0.49, 0.18));
  small(put(body, kit.cylinder(0.035, 0.035, 0.026, "badge-dot"), 0, 0.49, 0.204)).rotation.x = Math.PI / 2;
  head.position.y = 0.92;
  body.add(head);
  put(head, kit.box(0.68, 0.52, 0.52, color, 0.13), 0, 0, 0);
  const visor = small(put(head, kit.box(0.54, 0.25, 0.05, "visor", 0.09), 0, 0.005, 0.265));
  // At work the face screen catches the glow of the desk's screen: cool by day, warm in the evening (the theme's glow
  // follows the time of day).
  const visorDark = visor.material as THREE.Material,
    visorLit = kit.material("visor", { glow: "face-glow" });
  // The face screen: two soft eyes that blink, and glow a little after dark (the theme's glow scales them).
  const eyes = [-0.13, 0.13].map((x) => {
    const eye = small(put(head, kit.box(0.07, 0.1, 0.028, "eye", 0.03), x, 0.015, 0.298));
    eye.material = kit.material("eye", { glow: 0.18 });
    return eye;
  });
  small(put(head, kit.cylinder(0.018, 0.018, 0.19, "antenna-stem"), 0, 0.335, 0));
  const antenna = small(put(head, kit.sphere(0.075, "antenna"), 0, 0.435, 0));
  for (const x of [-0.355, 0.355]) small(put(head, kit.cylinder(0.09, 0.09, 0.065, "ear"), x, -0.01, 0)).rotation.z = Math.PI / 2;
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.32, 0.6, 0);
    body.add(arm);
    put(arm, kit.box(0.12, 0.29, 0.15, color, 0.06), 0, -0.11, 0);
    small(put(arm, kit.sphere(0.079, "hand"), 0, -0.24, 0.015));
    return arm;
  });
  const feet = [-0.16, 0.16].map((x) => put(group, kit.box(0.19, 0.14, 0.29, "foot", 0.065), x, 0.12, 0.065));
  if (variant === 1) put(head, kit.sphere(0.1, "petal"), 0.27, 0.22, 0.14).scale.set(1, 0.35, 1);
  if (variant === 2 && options.role !== "router") put(body, kit.box(0.32, 0.07, 0.37, "cap", 0.02), 0, 0.68, 0.01);
  if (options.role === "router") postal(kit, head, body, small);
  group.traverse((o) => {
    o.userData.agentId = options.key;
  });

  let posture: RobotPosture = "relaxed";
  let detail: RobotDetail = "near";
  let proxy = false;
  let alerted = false;
  let time = hash(options.key) % 1000;
  const blinkOffset = (hash(options.key) % 49) / 10;
  // Seeded idle rhythm: every robot glances or looks round on its own beat, never in step with its neighbours.
  const beat = 6.5 + (hash(`${options.key}:beat`) % 40) / 10;
  const side = hash(`${options.key}:side`) % 2 ? 1 : -1;
  // Materials this handle owns (translucent or greyed copies); the shared ones stay untouched.
  const originals = new Map<THREE.Mesh, THREE.Material>();
  const owned = new Map<THREE.Material, THREE.Material>();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) originals.set(o, o.material);
  });
  const grey = new THREE.Color(kit.hex("grey-bot"));
  // Near (inside a building), the robot's own colour carries a faint light of its own, so it stands out from the
  // furniture; the glow follows the time of day, a little stronger in the evening when the rooms dim. Far robots keep
  // the plain material (the town's crowd batches them).
  const base = kit.material(color);
  const shell = kit.material(color, { glow: 0.06 });

  const skin = () => {
    const greyed = posture === "greyed";
    for (const m of owned.values()) m.dispose();
    owned.clear();
    for (const [mesh, original] of originals) {
      if (!proxy && !greyed) {
        mesh.material = original === base && detail === "near" ? shell : original;
        mesh.castShadow = detail === "near";
        continue;
      }
      let copy = owned.get(original);
      if (!copy) {
        const c = (original as THREE.MeshStandardMaterial).clone();
        if (greyed) c.color.lerp(grey, 0.75);
        c.transparent = true;
        c.opacity = proxy ? 0.35 : 0.8;
        c.depthWrite = !proxy;
        owned.set(original, c);
        copy = c;
      }
      mesh.material = copy;
      mesh.castShadow = !proxy && detail === "near";
    }
  };

  const pose = () => {
    const face = posture === "focused" ? visorLit : visorDark;
    if (originals.get(visor) !== face) {
      originals.set(visor, face);
      if (!proxy && posture !== "greyed") visor.material = face;
    }
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    body.position.y = 0.12;
    for (const arm of arms) arm.rotation.set(0, 0, 0);
    for (const foot of feet) foot.position.set(foot.position.x, 0.12, 0.065);
    for (const eye of eyes) eye.scale.y = 1;
    antenna.position.y = 0.435;
    switch (posture) {
      case "focused":
        body.rotation.x = 0.16; // leaning in over the desk
        head.rotation.x = 0.12;
        arms[0]!.rotation.x = -0.9;
        arms[1]!.rotation.x = -0.9;
        break;
      case "relaxed":
        body.rotation.x = -0.12; // leaning back
        head.rotation.x = -0.1;
        head.rotation.z = 0.06;
        break;
      case "raised-hand":
        arms[1]!.rotation.z = 2.7;
        head.rotation.z = -0.08;
        break;
      case "greyed":
        head.rotation.x = 0.28; // head down, still
        body.rotation.x = 0.04;
        break;
      case "walking":
        body.rotation.x = 0.14; // leaning into the walk
        head.rotation.x = -0.06;
        break;
    }
    halo.uniforms.uActive!.value = alerted || posture === "raised-hand" ? 0.65 : 0;
    // An inactive halo draws nothing: skip its draw call.
    ring.visible = alerted || posture === "raised-hand";
  };
  pose();
  skin();

  return {
    object: group,
    setPosture(next) {
      if (next === posture) return;
      const wasGrey = posture === "greyed";
      posture = next;
      pose();
      if (wasGrey !== (posture === "greyed")) skin();
    },
    setProxy(next) {
      if (next === proxy) return;
      proxy = next;
      blob.visible = !proxy;
      skin();
    },
    setDetail(next) {
      if (next === detail) return;
      detail = next;
      for (const o of fine) o.visible = detail === "near";
      skin();
    },
    setAlert(alert) {
      alerted = alert;
      halo.uniforms.uColor!.value.set(kit.hex(alert ? "beacon" : color));
      halo.uniforms.uActive!.value = alert || posture === "raised-hand" ? 0.65 : 0;
      ring.visible = alert || posture === "raised-hand";
    },
    update(seconds) {
      if (proxy || posture === "greyed") return;
      time += seconds;
      halo.uniforms.uTime!.value = time;
      // Idle life from the old room: a blink every few seconds and a slow nod of the antenna.
      const blink = (time + blinkOffset) % 4.9 < 0.11;
      for (const eye of eyes) eye.scale.y = blink ? 0.15 : 1;
      antenna.position.y = 0.435 + Math.sin(time * 2.2) * 0.01;
      // A soft 0..1..0 swell, about 1.6 s long, once per beat: a glance up from the screen, a look round the room.
      const phase = (time % beat) / 1.6;
      const swell = phase < 1 ? Math.sin(phase * Math.PI) ** 2 : 0;
      if (posture === "focused") {
        // Typing in bursts: hands tap in turn and rest while the robot glances up and to the side, then back to work.
        const typing = 1 - swell;
        arms[0]!.rotation.x = -0.9 + Math.sin(time * 9) * 0.08 * typing + swell * 0.2;
        arms[1]!.rotation.x = -0.9 + Math.sin(time * 9 + 1.7) * 0.08 * typing + swell * 0.2;
        body.position.y = 0.12 + Math.abs(Math.sin(time * 1.6)) * 0.015;
        head.rotation.x = 0.12 - swell * 0.16;
        head.rotation.y = swell * 0.3 * side;
      } else if (posture === "relaxed") {
        // Weight shifting from foot to foot, a slow curious tilt, and now and then a look round the room.
        body.position.y = 0.12 + Math.sin(time * 1.1) * 0.01;
        body.rotation.z = Math.sin(time * 0.6 + blinkOffset) * 0.03;
        head.rotation.z = 0.06 + Math.sin(time * 0.9) * 0.06;
        head.rotation.y = swell * 0.45 * side;
      } else if (posture === "raised-hand") {
        // Waiting for a person: the hand waves, the robot bobs on its toes and tilts its head, asking.
        arms[1]!.rotation.z = 2.7 + Math.sin(time * 3) * 0.12;
        body.position.y = 0.12 + Math.abs(Math.sin(time * 3)) * 0.02;
        head.rotation.z = -0.08 + Math.sin(time * 0.8) * 0.05;
      } else if (posture === "walking") {
        // A soft trot: feet step in turn, arms swing against them, the body bobs and sways a little.
        const step = Math.sin(time * 8);
        feet[0]!.position.z = 0.065 + step * 0.08;
        feet[1]!.position.z = 0.065 - step * 0.08;
        feet[0]!.position.y = 0.12 + Math.max(0, step) * 0.06;
        feet[1]!.position.y = 0.12 + Math.max(0, -step) * 0.06;
        arms[0]!.rotation.x = -step * 0.45;
        arms[1]!.rotation.x = step * 0.45;
        body.position.y = 0.12 + Math.abs(step) * 0.035;
        body.rotation.z = step * 0.04;
      }
    },
    dispose() {
      for (const m of owned.values()) m.dispose();
      owned.clear();
      halo.dispose();
      group.removeFromParent();
    },
  };
}

/**
 * The post office's look: a postal cap whose crown the antenna pokes through (its ball sits on top like a pompom), and
 * a timber messenger satchel on the hip with a cross-body strap and letters peeking out. Everything rides the body and
 * head, so it follows postures and the walk.
 */
function postal(kit: Kit, head: THREE.Group, body: THREE.Group, small: <T extends THREE.Object3D>(o: T) => T) {
  put(head, kit.cylinder(0.21, 0.23, 0.1, "slate"), 0, 0.31, 0);
  put(head, kit.cylinder(0.235, 0.235, 0.03, "coral"), 0, 0.275, 0);
  put(head, kit.box(0.3, 0.025, 0.15, "slate", 0.012), 0, 0.27, 0.24).rotation.x = 0.12;
  small(put(head, kit.sphere(0.03, "brass"), 0, 0.31, 0.225)).scale.set(1, 1, 0.4);
  // A messenger satchel on the left hip, its strap across the chest from the right shoulder, letters peeking out.
  const bag = new THREE.Group();
  bag.position.set(-0.37, 0.27, 0.04);
  body.add(bag);
  put(bag, kit.box(0.11, 0.2, 0.28, "timber", 0.035), 0, 0, 0);
  put(bag, kit.box(0.12, 0.09, 0.29, "timber-light", 0.03), -0.006, 0.07, 0);
  small(put(bag, kit.box(0.02, 0.05, 0.06, "brass", 0.01), -0.065, 0.04, 0));
  for (const [z, tilt, color] of [
    [-0.07, 0.2, "paper"],
    [0.02, -0.1, "cream"],
    [0.09, 0.12, "paper"],
  ] as const)
    small(put(bag, kit.box(0.012, 0.09, 0.11, color, 0.006), 0.01, 0.12, z)).rotation.x = tilt;
  const strap = put(body, kit.box(0.045, 0.58, 0.02, "timber", 0.01), -0.02, 0.47, 0.182);
  strap.rotation.z = -0.72;
}
