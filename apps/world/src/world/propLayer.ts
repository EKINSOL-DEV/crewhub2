/* The town document inside one building: placed props on their room grids, error crates for placements that no
   longer fit and for prop requests whose prop is invalid, props that sit on an agent's desk, rule props from facts,
   and build mode's ghost and selection. Props that ride on a ticket are built here and handed to the object layer,
   which carries them with the work object (on a desk, in a pile, in the drone's hook). Every look comes from the
   building's resolved style: built-ins by `furniture.<id>`, user props through `parts()`, rule props by their
   semantic key. A placement that is new to the scene and marked fresh (made in build mode or imported from a ticket)
   materialises; so does a rule prop that appears after the building was first shown. */
import * as THREE from "three";
import type { Definitions, PropModel, Rotation } from "@crewhub/world-engine";
import type { Building, Catalogue, PlacedProp, RoomKind, RuleProp, TownDocument } from "@crewhub/world-model";
import type { ModelKey, ResolvedStyle, StyleTheme } from "@crewhub/world-style";
import { BUILDING_CELL as CELL, roomOf, type BuildingTemplate } from "./buildingTemplate";
import type { DeskSlot, Surface } from "./interiorLayout";
import { roomCentre } from "./interiorLayout";
import { footprintPose, isRider, turnedSize, type BuildingPlacements } from "./placements";
import type { InvalidRequest } from "./propImport";

const MATERIALISE_S = 1.2;
/** Built-in looks drawn at the interiors' scale (as buildingView draws the template's plant and bench). */
const BUILTIN_SCALE: Record<string, number> = { plant: 0.62, bench: 0.7 };
/** A prop on a desk or riding on a ticket is shrunk to fit this size (metres). */
const DESK_FIT = 0.3;
const TICKET_FIT = 0.16;

export interface Ghost {
  /** The placement id when moving a placed prop; null for a new one. */
  id: string | null;
  propId: string;
  room: RoomKind;
  cell: { x: number; z: number };
  rotation: Rotation;
  valid: boolean;
}

/** What the town document shows in one building, plus build mode's ghost and selection when it is entered. */
export interface TownLayer {
  doc: TownDocument;
  catalogue: Catalogue;
  definitions: Definitions;
  rules: readonly RuleProp[];
  invalid: readonly InvalidRequest[];
  /** Placement ids to materialise; the layer removes an id once it played. */
  fresh: Set<string>;
  build: { on: boolean; ghost: Ghost | null; selected: string | null; theme: StyleTheme } | null;
}

export interface PropLayerContext {
  style: ResolvedStyle;
  slug: string;
  reducedMotion: () => boolean;
  surface: (surface: Surface) => number;
  /** Building-local position → world position (for label anchors). */
  toWorld: (local: THREE.Vector3) => THREE.Vector3;
}

interface Item {
  holder: THREE.Group;
  body: THREE.Group;
  signature: string;
  /** Seconds into the materialise effect, or null when it is fully there. */
  appear: number | null;
}

export interface SyncInput {
  building: Building;
  template: BuildingTemplate;
  placements: BuildingPlacements;
  desks: Map<string, DeskSlot>;
  town: TownLayer;
  /** Only the entered building shows furniture and props. */
  detailed: boolean;
}

export class PropLayer {
  readonly group = new THREE.Group();
  readonly anchors = new Map<string, THREE.Vector3>();
  readonly #ctx: PropLayerContext;
  readonly #items = new Map<string, Item>();
  readonly #riders = new Map<string, Item>();
  #primed = false;
  #ghost: { object: THREE.Group; signature: string; materials: THREE.Material[] } | null = null;
  #selection: { object: THREE.Object3D; signature: string } | null = null;

  constructor(ctx: PropLayerContext) {
    this.#ctx = ctx;
  }

  /** Rebuilds what changed; returns the riders per ticket key for the object layer. */
  sync(input: SyncInput): Map<string, THREE.Object3D[]> {
    const { building: b, template, placements, desks, town } = input;
    const seen = new Set<string>();
    const seenRiders = new Set<string>();
    this.anchors.clear();
    const riders = new Map<string, THREE.Object3D[]>();
    this.group.visible = input.detailed;
    if (!input.detailed || b.archived) {
      this.#prune(seen, seenRiders);
      this.#syncGhost(null, template, town);
      return riders;
    }

    // Placed props on their room grids.
    for (const room of placements.rooms.values())
      for (const p of room.placed) {
        const def = town.definitions[p.propId];
        if (!def) continue;
        const pose = footprintPose(def, p.cell, p.rotation);
        const item = this.#item(`p:${p.id}`, seen, this.#lookSignature(p.propId, town), () => this.#look(p.propId, town), town.fresh.has(p.id));
        town.fresh.delete(p.id);
        item.holder.position.set((room.site.origin.x + pose.x) * CELL, 0.02, (room.site.origin.z + pose.z) * CELL);
        item.holder.rotation.y = pose.rotationY;
        item.holder.traverse((o) => (o.userData.placementId = p.id));
      }

    // Placements that no longer fit: an error crate where they were meant to stand.
    placements.errors.forEach((error, i) => {
      const at = this.#errorSpot(template, error.room, error.placement, i);
      const item = this.#item(`e:${error.placement.id}`, seen, "error-crate", () => this.#ctx.style.model("error-crate"), false);
      item.holder.position.copy(at);
      item.holder.traverse((o) => (o.userData.placementId = error.placement.id));
      this.anchors.set(`err:${this.#ctx.slug}:${error.placement.id}`, this.#ctx.toWorld(at.clone().setY(0.62)));
    });

    // Prop requests whose prop is invalid.
    town.invalid
      .filter((r) => r.slug === b.slug)
      .forEach((r, i) => {
        const room = roomOf(template, r.room) ?? roomOf(template, "storage");
        if (!room) return;
        const c = roomCentre(room);
        const at = new THREE.Vector3((c.x + 0.8 + i * 0.9) * CELL, 0.02, (c.z + 0.9) * CELL);
        const item = this.#item(`i:${r.ticketKey}`, seen, "error-crate", () => this.#ctx.style.model("error-crate"), this.#primed);
        item.holder.position.copy(at);
        this.anchors.set(`err:${this.#ctx.slug}:${r.ticketKey}`, this.#ctx.toWorld(at.clone().setY(0.62)));
      });

    // Props attached to an agent sit on its desk, wherever that agent works now.
    const onDesk = new Map<string, number>();
    for (const p of town.doc.placements) {
      if (p.attachment?.kind !== "agent") continue;
      const desk = desks.get(p.attachment.ref);
      if (!desk) continue;
      const n = onDesk.get(desk.agentKey) ?? 0;
      onDesk.set(desk.agentKey, n + 1);
      const lead = desk.definitionId === "lead-desk";
      const item = this.#item(`a:${p.id}`, seen, this.#lookSignature(p.propId, town), () => fit(this.#look(p.propId, town), DESK_FIT), town.fresh.has(p.id));
      town.fresh.delete(p.id);
      item.holder.position.set((desk.desk.x + (lead ? 0.9 : 0.55) - n * 0.5) * CELL, this.#ctx.surface(lead ? "lead-desk" : "desk") + 0.01, (desk.desk.z - 0.1) * CELL);
      item.holder.traverse((o) => (o.userData.placementId = p.id));
    }

    // Rule props from facts.
    const trophies = { n: 0 };
    let banners = 0,
      crates = 0;
    for (const rule of town.rules) {
      if (rule.anchor.building !== b.slug) continue;
      const key = rule.key as ModelKey;
      if (rule.anchor.kind === "ticket") {
        const rider = this.#rider(`r:${rule.id}`, seenRiders, key, () => fit(this.#ctx.style.model(key), TICKET_FIT));
        push(riders, rule.anchor.ticketKey, rider.holder);
        continue;
      }
      let at: THREE.Vector3 | null = null;
      if (rule.anchor.kind === "room") {
        const room = roomOf(template, rule.anchor.room);
        if (!room) continue;
        if (rule.key === "banner") at = new THREE.Vector3((room.origin.x + 1.4 + (banners++ % 2) * 1.5) * CELL, 0.02, (room.origin.z + 0.6) * CELL);
        else {
          const i = crates++;
          at = new THREE.Vector3((room.origin.x + 4.6 + (i % 2) * 0.9) * CELL, 0.02, (room.origin.z + 3.6 - Math.floor(i / 2) * 0.8) * CELL);
        }
      } else {
        const desk = desks.get(rule.anchor.agent);
        if (!desk) continue;
        const top = this.#ctx.surface(desk.definitionId === "lead-desk" ? "lead-desk" : "desk");
        at =
          rule.key === "jar"
            ? new THREE.Vector3((desk.desk.x + 0.95) * CELL, top, (desk.desk.z - 0.35) * CELL)
            : new THREE.Vector3((desk.desk.x + 0.2 - trophies.n++ * 0.45) * CELL, top, (desk.desk.z - 0.3) * CELL);
      }
      const item = this.#item(`r:${rule.id}`, seen, key, () => {
        const model = this.#ctx.style.model(key);
        if (key === "banner") model.scale.setScalar(0.8);
        return model;
      }, this.#primed);
      item.holder.position.copy(at);
      this.anchors.set(`rule:${this.#ctx.slug}:${rule.id}`, this.#ctx.toWorld(at.clone().setY(at.y + (key === "banner" ? 1.2 : 0.4))));
    }

    // Props attached to a ticket ride on its work object.
    for (const p of town.doc.placements) {
      if (p.attachment?.kind !== "ticket" || !("building" in p.at) || p.at.building !== b.slug) continue;
      const rider = this.#rider(`t:${p.id}`, seenRiders, this.#lookSignature(p.propId, town), () => fit(this.#look(p.propId, town), TICKET_FIT));
      push(riders, p.attachment.ref, rider.holder);
    }

    this.#prune(seen, seenRiders);
    this.#syncGhost(town.build?.on ? town.build.ghost : null, template, town);
    this.#syncSelection(town.build?.on ? town.build.selected : null, placements, town);
    this.#primed = true;
    return riders;
  }

  #lookSignature(propId: string, town: TownLayer): string {
    const model = town.catalogue.get(propId)?.model;
    return model ? `${propId}|${JSON.stringify(model.parts)}` : propId;
  }

  /** A catalogue entry's look: a user prop through the style's parts renderer, a built-in by its furniture key. */
  #look(propId: string, town: TownLayer): THREE.Object3D {
    const entry = town.catalogue.get(propId);
    if (entry?.model) return this.#ctx.style.parts(entry.model as PropModel);
    const key = propId.replace(/^builtin:/, "");
    const model = this.#ctx.style.model(`furniture.${key}`, { seed: key.length });
    const scale = BUILTIN_SCALE[key];
    if (scale) model.scale.setScalar(scale);
    return model;
  }

  #item(key: string, seen: Set<string>, signature: string, make: () => THREE.Object3D, appear: boolean): Item {
    seen.add(key);
    let item = this.#items.get(key);
    if (item && item.signature === signature) return item;
    item?.holder.removeFromParent();
    item = { holder: new THREE.Group(), body: new THREE.Group(), signature, appear: appear && !this.#ctx.reducedMotion() ? 0 : null };
    item.body.add(make());
    item.holder.add(item.body);
    if (item.appear !== null) this.#ctx.style.materialise(item.body, 0);
    this.group.add(item.holder);
    this.#items.set(key, item);
    return item;
  }

  #rider(key: string, seen: Set<string>, signature: string, make: () => THREE.Object3D): Item {
    seen.add(key);
    let item = this.#riders.get(key);
    if (item && item.signature === signature) return item;
    item = { holder: new THREE.Group(), body: new THREE.Group(), signature, appear: null };
    item.body.add(make());
    item.holder.add(item.body);
    this.#riders.set(key, item);
    return item;
  }

  #prune(seen: Set<string>, seenRiders: Set<string>) {
    for (const [key, item] of this.#items)
      if (!seen.has(key)) {
        item.holder.removeFromParent();
        this.#items.delete(key);
      }
    for (const [key, item] of this.#riders)
      if (!seenRiders.has(key)) {
        item.holder.removeFromParent();
        this.#riders.delete(key);
      }
  }

  #errorSpot(template: BuildingTemplate, kind: RoomKind | null, p: PlacedProp, i: number): THREE.Vector3 {
    const room = (kind && roomOf(template, kind)) || roomOf(template, "lobby")!;
    const inside = kind !== null && p.cell.x < room.layout.grid.width && p.cell.z < room.layout.grid.depth;
    const c = inside ? { x: room.origin.x + p.cell.x + 0.5, z: room.origin.z + p.cell.z + 0.5 } : { x: roomCentre(room).x - 1 + i * 0.9, z: roomCentre(room).z };
    return new THREE.Vector3(c.x * CELL, 0.02, c.z * CELL);
  }

  #syncGhost(ghost: Ghost | null, template: BuildingTemplate, town: TownLayer) {
    const def = ghost ? town.definitions[ghost.propId] : undefined;
    const room = ghost ? roomOf(template, ghost.room) : undefined;
    if (!ghost || !def || !room) {
      this.#dropGhost();
      return;
    }
    const theme = town.build?.theme ?? "day";
    const signature = `${this.#lookSignature(ghost.propId, town)}|${ghost.rotation}|${ghost.valid}|${theme}`;
    if (this.#ghost?.signature !== signature) {
      this.#dropGhost();
      const object = new THREE.Group();
      const materials: THREE.Material[] = [];
      const look = this.#look(ghost.propId, town);
      look.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const list = (Array.isArray(o.material) ? o.material : [o.material]).map((m: THREE.Material) => {
          const clone = m.clone();
          clone.transparent = true;
          clone.opacity = 0.55;
          clone.depthWrite = false;
          materials.push(clone);
          return clone;
        });
        o.material = Array.isArray(o.material) ? list : list[0]!;
        o.castShadow = false;
      });
      look.rotation.y = footprintPose(def, { x: 0, z: 0 }, ghost.rotation).rotationY;
      object.add(look);
      const size = turnedSize(def, ghost.rotation);
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(size.width * CELL - 0.04, size.depth * CELL - 0.04).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: this.#ctx.style.color(ghost.valid ? "sage" : "coral", theme), transparent: true, opacity: 0.5, depthWrite: false }),
      );
      tile.position.y = 0.03;
      materials.push(tile.material);
      object.add(tile);
      object.userData.tile = tile;
      this.#ghost = { object, signature, materials };
      this.group.add(object);
    }
    const pose = footprintPose(def, ghost.cell, ghost.rotation);
    this.#ghost.object.position.set((room.origin.x + pose.x) * CELL, 0.02, (room.origin.z + pose.z) * CELL);
  }

  #dropGhost() {
    if (!this.#ghost) return;
    this.#ghost.object.removeFromParent();
    for (const m of this.#ghost.materials) m.dispose();
    (this.#ghost.object.userData.tile as THREE.Mesh | undefined)?.geometry.dispose();
    this.#ghost = null;
  }

  #syncSelection(selected: string | null, placements: BuildingPlacements, town: TownLayer) {
    let found: { p: PlacedProp; origin: { x: number; z: number } } | null = null;
    for (const room of placements.rooms.values()) {
      const p = room.placed.find((x) => x.id === selected);
      if (p) found = { p, origin: room.site.origin };
    }
    const def = found ? town.definitions[found.p.propId] : undefined;
    if (!found || !def || isRider(found.p)) {
      this.#selection?.object.removeFromParent();
      this.#selection = null;
      return;
    }
    const size = turnedSize(def, found.p.rotation);
    const signature = `${size.width}x${size.depth}`;
    if (this.#selection?.signature !== signature) {
      this.#selection?.object.removeFromParent();
      this.#selection = { object: this.#ctx.style.model("focus-ring", { size: { width: size.width * CELL, height: 0, depth: size.depth * CELL } }), signature };
      this.group.add(this.#selection.object);
    }
    const pose = footprintPose(def, found.p.cell, found.p.rotation);
    this.#selection.object.position.set((found.origin.x + pose.x) * CELL, 0.03, (found.origin.z + pose.z) * CELL);
  }

  get animating(): boolean {
    for (const item of this.#items.values()) if (item.appear !== null) return true;
    return false;
  }

  tick(seconds: number) {
    for (const item of this.#items.values()) {
      if (item.appear === null) continue;
      item.appear += seconds;
      const done = this.#ctx.reducedMotion() || item.appear >= MATERIALISE_S;
      this.#ctx.style.materialise(item.body, done ? 1 : item.appear / MATERIALISE_S);
      if (done) item.appear = null;
    }
  }

  /** The placement under a ray hit (placed props, desk props and error crates of placements). */
  resolve(hit: THREE.Intersection): string | null {
    return (hit.object.userData.placementId as string | undefined) ?? null;
  }

  dispose() {
    this.#dropGhost();
    this.#selection?.object.removeFromParent();
    this.group.removeFromParent();
  }
}

/** Shrinks a look so its largest side is at most `size` metres, standing on its base. */
function fit(object: THREE.Object3D, size: number): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(object);
  const largest = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  const holder = new THREE.Group();
  holder.add(object);
  if (largest > size) holder.scale.setScalar(size / largest);
  return holder;
}

function push(map: Map<string, THREE.Object3D[]>, key: string, object: THREE.Object3D) {
  const list = map.get(key);
  if (list) list.push(object);
  else map.set(key, [object]);
}
