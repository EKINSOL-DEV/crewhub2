// Live bot positions (EKI-116): Bot3D publishes its rendered position every
// frame; the camera reads it to fly to and follow a selected bot. Module-level
// map on purpose — this is render-loop data, not React state, and must never
// trigger re-renders.

const poses = new Map<string, [number, number, number]>();

export function publishBotPose(key: string, x: number, y: number, z: number): void {
  const p = poses.get(key);
  if (p) {
    p[0] = x;
    p[1] = y;
    p[2] = z;
  } else {
    poses.set(key, [x, y, z]);
  }
}

export function readBotPose(key: string): readonly [number, number, number] | null {
  return poses.get(key) ?? null;
}

export function dropBotPose(key: string): void {
  poses.delete(key);
}
