/* The name lists of the cast contract (index.ts explains them), apart so the validator, the runtime and the contract
   test can list them. */
export const CAST_ROLES = ["lead", "worker", "design", "analyst", "postman", "operator", "unknown"] as const;
export const FIGURE_ACTIVITIES = ["working", "idle", "done", "blocked", "stale", "walking"] as const;
/**
 * The places a figure works at a surface. The world maps its furniture onto them; a cast may bring a perch for each
 * (`perch` in its figure data).
 */
export const WORK_POSES = ["desk", "lead-desk", "meeting-table", "planning-table", "review-table"] as const;
/** The animatable channels of a joint, in this order: a figure's compiled waves index a joint's nine channels by it. */
export const MOTION_CHANNELS = ["rotation.x", "rotation.y", "rotation.z", "offset.x", "offset.y", "offset.z", "scale.x", "scale.y", "scale.z"] as const;
export const MOTION_WAVES = ["sine", "bounce", "lift", "blink", "glance"] as const;
/** The colour names every `FigureKit` resolves, unless the cast gives its own colour of that name. */
export const RESERVED_COLORS = ["alert", "stale"] as const;
