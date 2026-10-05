/* The contract every cast passes (spec addendum "casts"): every role and every state builds, the anchors are sane, a
   figure stays inside its manifest's budget near and far, far figures are made only of materials the renderer's
   crowd batches, and at every work place the world has, the working figure sees over the surface to what it works on
   (on its perch, when it brings one). Measured with any `FigureKit`; the test suite uses the reference kit. */
import * as THREE from "three";
import { figureEyes } from "./figure.ts";
import type { Cast, FigureHandle, FigureState, WorkPlace } from "./index.ts";
import { CAST_ROLES, FIGURE_ACTIVITIES } from "./names.ts";

export interface FigureMeasure {
  triangles: number;
  meshes: number;
  /** Shown meshes the far crowd cannot batch: anything but a plain opaque standard material or a ground decal. */
  unbatched: number;
}

function shown(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === root) break;
  }
  return true;
}

/** What a figure draws as it stands now: its shown meshes, their triangles, and those the crowd would not batch. */
export function measureFigure(handle: FigureHandle): FigureMeasure {
  const measure: FigureMeasure = { triangles: 0, meshes: 0, unbatched: 0 };
  handle.object.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !shown(o, handle.object)) return;
    // The contact shadow and the halo are the kit's, on the ground: they are not the cast's to budget.
    if (o.userData.decal || !(o.material instanceof THREE.MeshStandardMaterial)) return;
    const geometry = o.geometry as THREE.BufferGeometry;
    measure.triangles += (geometry.index ? geometry.index.count : (geometry.getAttribute("position")?.count ?? 0)) / 3;
    measure.meshes++;
    const m = o.material;
    if (m.type !== "MeshStandardMaterial" || m.transparent || m.map) measure.unbatched++;
  });
  return measure;
}

/** Every state a figure can be asked for: each activity, with and without waiting, alert, proxy and carrying. */
export function everyState(): FigureState[] {
  const states: FigureState[] = [];
  for (const activity of FIGURE_ACTIVITIES)
    for (let bits = 0; bits < 16; bits++) states.push({ activity, waiting: !!(bits & 1), alert: !!(bits & 2), proxy: !!(bits & 4), carrying: !!(bits & 8) });
  return states;
}

/** A worker may look at its work from this far to the side of where it faces, and at a screen from this far off its axis. */
const SIGHT_TURN = 75;
const SCREEN_CONE = 75;
const WORKING: FigureState = { activity: "working", waiting: false, alert: false, proxy: false, carrying: false };

/**
 * Why a figure at a work place cannot see its work, one line per problem. The figure is put there as the renderer
 * does it (standing on the floor at the origin, facing +z, at the place's scale, told `setPerch`), and its eyes are
 * read from its own body: above the top, turned towards what it looks at, and in front of a screen.
 */
export function sightProblems(handle: FigureHandle, place: WorkPlace, at: string): string[] {
  const problems: string[] = [];
  const { object } = handle;
  const kept = { position: object.position.clone(), rotation: object.rotation.y, scale: object.scale.clone() };
  object.position.set(0, 0, 0);
  object.rotation.y = 0;
  object.scale.setScalar(place.scale);
  handle.setState(WORKING);
  handle.setDetail("near");
  handle.setPerch(place, true);
  object.updateMatrixWorld(true);
  const eyes = handle.body.localToWorld(new THREE.Vector3(...figureEyes(handle.anchors)));
  const focus = new THREE.Vector3(...place.focus);
  if (![eyes.x, eyes.y, eyes.z].every(Number.isFinite)) problems.push(`${at}: its place on the perch is not finite`);
  else {
    const cm = (n: number) => `${(n * 100).toFixed(0)} cm`;
    if (eyes.y <= place.height) problems.push(`${at}: its eyes (${cm(eyes.y)}) are not above the surface (${cm(place.height)}); it needs a perch`);
    const sight = new THREE.Vector2(focus.x - eyes.x, focus.z - eyes.z);
    const facing = handle.body.getWorldDirection(new THREE.Vector3());
    const turn = Math.abs(new THREE.Vector2(facing.x, facing.z).angleTo(sight)) / (Math.PI / 180);
    if (sight.length() > 1e-6 && turn > SIGHT_TURN) problems.push(`${at}: it faces ${turn.toFixed(0)}° away from what it works on`);
    if (place.screen) {
      const off = Math.abs(new THREE.Vector2(...place.screen).angleTo(sight.clone().negate())) / (Math.PI / 180);
      if (off > SCREEN_CONE) problems.push(`${at}: it is ${off.toFixed(0)}° off the screen's axis and cannot read it`);
    }
  }
  handle.setPerch(null, true);
  object.position.copy(kept.position);
  object.rotation.y = kept.rotation;
  object.scale.copy(kept.scale);
  return problems;
}

/**
 * Why a cast breaks the contract, one line per problem; empty when it passes. `places` are the world's work places
 * (one of each pose is enough): every role must see its work at each.
 */
export function castProblems(cast: Cast, places: readonly WorkPlace[] = []): string[] {
  const problems: string[] = [];
  const { id, budget } = cast.manifest;
  for (const role of CAST_ROLES) {
    const at = `${id} ${role}`;
    let handle: FigureHandle;
    try {
      handle = cast.figure({ key: `contract:${role}`, role, accent: role === "unknown" ? null : "coral" });
    } catch (error) {
      problems.push(`${at}: does not build (${(error as Error).message})`);
      continue;
    }
    const a = handle.anchors;
    const finite = [...a.label, ...a.carry, a.ground, a.height].every(Number.isFinite);
    if (!finite || a.ground <= 0 || a.height <= 0) problems.push(`${at}: anchors must be finite, with a ground radius and a height above 0`);
    else {
      if (a.label[1] < a.height * 0.8 || a.label[1] > a.height * 1.5) problems.push(`${at}: the label anchor (${a.label[1]}) must sit just above the head (height ${a.height})`);
      if (a.carry[1] < 0 || a.carry[1] > a.height) problems.push(`${at}: the carry anchor must be between the feet and the head`);
      if (a.ground > a.height) problems.push(`${at}: the ground radius is larger than the figure is tall`);
    }
    let near = 0,
      far = 0,
      nearMeshes = 0,
      farMeshes = 0;
    for (const state of everyState()) {
      const name = `${at} ${state.activity}${state.waiting ? " waiting" : ""}${state.alert ? " alert" : ""}${state.proxy ? " proxy" : ""}${state.carrying ? " carrying" : ""}`;
      try {
        handle.setState(state);
        handle.setDetail("near");
        handle.update(0.3);
        const n = measureFigure(handle);
        handle.setDetail("far");
        const f = measureFigure(handle);
        near = Math.max(near, n.triangles);
        far = Math.max(far, f.triangles);
        nearMeshes = Math.max(nearMeshes, n.meshes);
        farMeshes = Math.max(farMeshes, f.meshes);
        if (!n.meshes || !f.meshes) problems.push(`${name}: draws nothing`);
        // A proxy and a stale figure are see-through by the runtime's own treatment; every other far figure batches.
        if (!state.proxy && state.activity !== "stale" && f.unbatched) problems.push(`${name}: ${f.unbatched} far part(s) the crowd cannot batch (use the kit's plain materials)`);
        const box = new THREE.Box3().setFromObject(handle.object);
        if (![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) problems.push(`${name}: the pose is not finite`);
      } catch (error) {
        problems.push(`${name}: throws (${(error as Error).message})`);
      }
    }
    for (const highlight of ["hover", "selected", "none"] as const) handle.setHighlight(highlight);
    for (const place of places) {
      try {
        problems.push(...sightProblems(handle, place, `${at} at the ${place.pose}`));
        // On its perch the figure still fits its budget, step and all.
        handle.setPerch(place, true);
        const perched = measureFigure(handle);
        near = Math.max(near, perched.triangles);
        nearMeshes = Math.max(nearMeshes, perched.meshes);
        handle.setPerch(null, true);
      } catch (error) {
        problems.push(`${at} at the ${place.pose}: throws (${(error as Error).message})`);
      }
    }
    if (near > budget.nearTriangles) problems.push(`${at}: ${near} triangles near, over the budget of ${budget.nearTriangles}`);
    if (far > budget.farTriangles) problems.push(`${at}: ${far} triangles far, over the budget of ${budget.farTriangles}`);
    if (nearMeshes > budget.nearMeshes) problems.push(`${at}: ${nearMeshes} meshes near, over the budget of ${budget.nearMeshes}`);
    if (farMeshes > budget.farMeshes) problems.push(`${at}: ${farMeshes} meshes far, over the budget of ${budget.farMeshes}`);
    handle.dispose();
  }
  return problems;
}
