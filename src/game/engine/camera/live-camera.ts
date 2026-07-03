// Live camera-yaw mirror (M8 T3): building-click handlers (CampusWorld,
// PlacedBuildings) need the camera's CURRENT yaw to seed focusBuilding()'s
// shortest-arc door pick (director.ts), but GameCameraRig owns goal/current
// privately and never touches the store beyond `mode` (see its file doc
// comment) — there's no prop path from the rig down into CampusWorld either
// (siblings under GameCanvas). Same module-level-mirror shape as
// live-bots.ts's sim -> camera bridge, just the other direction: the rig
// writes here once per frame, click handlers read it synchronously.
let yaw = 0;

/** GameCameraRig calls this once per frame with its damped `current.current.yaw`. */
export function setLiveYaw(y: number): void {
  yaw = y;
}

/** Building-click handlers read this to seed focusBuilding()'s currentYaw. Never subscribed to — a plain synchronous read at click time. */
export function getLiveYaw(): number {
  return yaw;
}
