/* Which keys pressed inside the stage belong to the scene (App.tsx `sceneKey`). */

interface Closest {
  closest?: (selector: string) => unknown;
}

/**
 * False for a key pressed in the agent card or any dialog inside the stage (round 50, r50-a11y A4): there an arrow
 * scrolls the card or moves in it, and must not move the room or building ring behind it and speak another place.
 * The canvas, the scene's labels and anything that is not an element stay the scene's.
 */
export function sceneOwnsKey(target: Closest | null): boolean {
  return !target?.closest?.('[role="dialog"], .agent-card');
}

/**
 * The layer that holds the focus when Escape is pressed (round 65, w6-7): the text view, the build sheet, or neither
 * (the scene, a corner tool). With build mode and the text view both open, Escape closes the one the focus is in.
 */
export function escapeLayer(target: Closest | null): "text" | "build" | null {
  if (target?.closest?.("#text-view")) return "text";
  if (target?.closest?.(".build-sheet")) return "build";
  return null;
}
