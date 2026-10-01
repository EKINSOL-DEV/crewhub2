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
  const color = options.role === "lead" && options.accent ? options.accent : WORKER_COLORS[hash(options.key) % 3]!;
  const variant = options.role === "design" ? 1 : options.role === "analyst" || options.role === "router" ? 2 : 0;
  const group = new THREE.Group(),
    body = new THREE.Group(),
    head = new THREE.Group();
  const halo = haloMaterial(kit.hex(color));
  const ring = new THREE.Mesh(kit.geometry("halo", () => new THREE.PlaneGeometry(1.45, 1.45)), halo);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring, body);
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
  put(head, kit.box(0.54, 0.25, 0.05, "visor", 0.09), 0, 0.005, 0.265);
  for (const x of [-0.13, 0.13]) small(put(head, kit.box(0.07, 0.1, 0.028, "eye", 0.03), x, 0.015, 0.298));
  small(put(head, kit.cylinder(0.018, 0.018, 0.19, "antenna-stem"), 0, 0.335, 0));
  put(head, kit.sphere(0.075, "antenna"), 0, 0.435, 0);
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
  if (variant === 2) put(body, kit.box(0.32, 0.07, 0.37, "cap", 0.02), 0, 0.68, 0.01);
  group.traverse((o) => {
    o.userData.agentId = options.key;
  });

  let posture: RobotPosture = "relaxed";
  let detail: RobotDetail = "near";
  let proxy = false;
  let alerted = false;
  let time = hash(options.key) % 1000;
  // Materials this handle owns (translucent or greyed copies); the shared ones stay untouched.
  const originals = new Map<THREE.Mesh, THREE.Material>();
  const owned = new Map<THREE.Material, THREE.Material>();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) originals.set(o, o.material);
  });
  const grey = new THREE.Color(kit.hex("grey-bot"));

  const skin = () => {
    const greyed = posture === "greyed";
    for (const m of owned.values()) m.dispose();
    owned.clear();
    for (const [mesh, original] of originals) {
      if (!proxy && !greyed) {
        mesh.material = original;
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
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    body.position.y = 0.12;
    for (const arm of arms) arm.rotation.set(0, 0, 0);
    for (const foot of feet) foot.position.z = 0.065;
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
  };
  pose();

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
    },
    update(seconds) {
      if (proxy || posture === "greyed") return;
      time += seconds;
      halo.uniforms.uTime!.value = time;
      if (posture === "focused") {
        // Slow typing: hands tap in turn, a small bob.
        arms[0]!.rotation.x = -0.9 + Math.sin(time * 9) * 0.08;
        arms[1]!.rotation.x = -0.9 + Math.sin(time * 9 + 1.7) * 0.08;
        body.position.y = 0.12 + Math.abs(Math.sin(time * 1.6)) * 0.015;
      } else if (posture === "relaxed") {
        body.position.y = 0.12 + Math.sin(time * 1.1) * 0.01;
      } else if (posture === "raised-hand") {
        arms[1]!.rotation.z = 2.7 + Math.sin(time * 3) * 0.12;
      } else if (posture === "walking") {
        // A soft trot: feet step in turn, arms swing against them, the body bobs and sways a little.
        const step = Math.sin(time * 8);
        feet[0]!.position.z = 0.065 + step * 0.08;
        feet[1]!.position.z = 0.065 - step * 0.08;
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
