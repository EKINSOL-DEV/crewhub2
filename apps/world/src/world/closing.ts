/* A building closes, or opens again: `project.archived` plays a closing (the lights go out one by one, the shell
   turns to its boarded-up look and the boards drop into place), `project.restored` the reverse (the boards lift
   away, the lights come back on). Style-agnostic: the BuildingView rebuilds its shell on request and hands over the
   pieces its style tagged (world-style `LightTag`: `userData.pane`, `userData.board`); a style that tags nothing
   gives an empty list, and the phase is over at once. Under reduced motion no Closing is made: the shell cuts. */
import * as THREE from "three";
import type { LightTag } from "@crewhub/world-style";

/** Seconds: the lights go out (or come on), the boards drop (or lift). Each piece is staggered within its phase. */
const LIGHTS = 0.8,
  BOARDS = 1.1,
  /** A short breath between the two phases. */
  BREATH = 0.25,
  /** How far above their place the boards start (a closing) or end up (an opening), world units. */
  DROP = 1.3;

const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const unit = (t: number) => Math.min(1, Math.max(0, t));

/** Rebuilds the shell for `archived` and returns the tagged pieces asked for (moved out of the static batches). */
export type ShellBuild = (archived: boolean, pull: "lights" | "boards" | null) => { lights: THREE.Mesh[]; boards: THREE.Object3D[] };

interface Board {
  object: THREE.Object3D;
  rest: THREE.Vector3;
  tilt: number;
  /** Phase-local start, seconds. */
  delay: number;
}

export class Closing {
  readonly kind: "closing" | "opening";
  readonly #build: ShellBuild;
  #phase: "lights" | "boards" | "done";
  #t = 0;
  #lights: { mesh: THREE.Mesh; tag: LightTag; delay: number }[] = [];
  #boards: Board[] = [];

  constructor(kind: "closing" | "opening", build: ShellBuild) {
    this.kind = kind;
    this.#build = build;
    if (kind === "closing") {
      // The active shell with its lights live: they go out east to west.
      this.#phase = "lights";
      this.#takeLights(this.#build(false, "lights").lights, "lit");
    } else {
      // The boarded shell with its boards live: they come off.
      this.#phase = "boards";
      this.#takeBoards(this.#build(true, "boards").boards, "rest");
    }
  }

  #takeLights(meshes: THREE.Mesh[], show: "lit" | "dark") {
    const tagged = meshes.filter((m) => m.userData.pane).sort((a, b) => b.position.x - a.position.x);
    this.#lights = tagged.map((mesh, i) => {
      const tag = mesh.userData.pane as LightTag;
      mesh.material = tag[show];
      return { mesh, tag, delay: tagged.length <= 1 ? 0 : (i / (tagged.length - 1)) * (LIGHTS * 0.75) };
    });
  }

  #takeBoards(objects: THREE.Object3D[], at: "rest" | "above") {
    this.#boards = objects.map((object, i) => {
      const board: Board = { object, rest: object.position.clone(), tilt: object.rotation.z, delay: ((i * 7) % objects.length) / Math.max(1, objects.length) * (BOARDS * 0.45) };
      if (at === "above") {
        object.position.y = board.rest.y + DROP;
        object.rotation.z = board.tilt + 0.25;
      }
      return board;
    });
  }

  /** True while the building should look closed inside (no silhouette): a closing once the boards come, an opening until they are off. */
  interiorClosed(): boolean {
    if (this.#phase === "done") return this.kind === "closing";
    return this.kind === "closing" ? this.#phase === "boards" : this.#phase === "boards";
  }

  /** Advances by `seconds` (real time); false once the shell stands in its final, merged form. */
  tick(seconds: number): boolean {
    if (this.#phase === "done") return false;
    this.#t += seconds;
    const t = this.#t;
    if (this.kind === "closing") {
      if (this.#phase === "lights") {
        for (const light of this.#lights) if (t >= light.delay) light.mesh.material = light.tag.dark;
        if (t < LIGHTS + BREATH) return true;
        this.#phase = "boards";
        this.#t = 0;
        this.#takeBoards(this.#build(true, "boards").boards, "above");
        return true;
      }
      // The boards drop: gravity (ease in), each on its own beat, and settle on their nails.
      let falling = false;
      for (const board of this.#boards) {
        const k = unit((t - board.delay) / (BOARDS * 0.55));
        board.object.position.y = board.rest.y + DROP * (1 - easeIn(k));
        board.object.rotation.z = board.tilt + 0.25 * (1 - easeOut(k));
        if (k < 1) falling = true;
      }
      if (falling) return true;
      return this.finish();
    }
    if (this.#phase === "boards") {
      // The boards come off: a pull (ease in) up and away, each on its own beat.
      let lifting = false;
      for (const board of this.#boards) {
        const k = unit((t - board.delay) / (BOARDS * 0.6));
        board.object.position.y = board.rest.y + DROP * easeIn(k);
        board.object.rotation.z = board.tilt - 0.35 * easeOut(k);
        board.object.visible = k < 1;
        if (k < 1) lifting = true;
      }
      if (lifting) return true;
      this.#phase = "lights";
      this.#t = 0;
      this.#takeLights(this.#build(false, "lights").lights, "dark");
      return true;
    }
    for (const light of this.#lights) if (t >= light.delay) light.mesh.material = light.tag.lit;
    if (t < LIGHTS + BREATH) return true;
    return this.finish();
  }

  /** Ends at once: the shell is rebuilt in its final form, merged, with nothing live left over. */
  finish(): false {
    if (this.#phase === "done") return false;
    this.#phase = "done";
    this.#lights = [];
    this.#boards = [];
    this.#build(this.kind === "closing", null);
    return false;
  }
}
