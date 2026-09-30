/**
 * Prop requests travel as CrewHub tickets labelled `prop`; the builder posts the prop as a
 * comment with a fenced json block, because `comment.created` is emitted and `attachment.added`
 * never is (events.md). The JSON files follow the `crewhub-prop/1` shape as far as it is known
 * tonight; `packages/world-engine/src/props.ts` owns the format and its validator.
 * `broken-sign.json` is invalid on purpose: a part lies far outside its footprint.
 */
import brokenSign from "./props/broken-sign.json" with { type: "json" };
import readingNook from "./props/reading-nook.json" with { type: "json" };
import tallFern from "./props/tall-fern.json" with { type: "json" };

export const DEMO_PROPS = { readingNook, tallFern, brokenSign } as const;

/** The builder's comment: a line of text and the prop as a fenced json block. */
export function propComment(prop: unknown): string {
  return `Prop ready for review.\n\n\`\`\`json\n${JSON.stringify(prop, null, 2)}\n\`\`\``;
}

export function propSlug(thing: string): string {
  const slug = thing
    .toLowerCase()
    .replace(/^(an?|the)\s+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug === "" ? "prop" : slug;
}

/**
 * A placeholder prop for an on-demand request: a small crate with a lid. Deterministic for the
 * same text. A real lane would build it with the prop-builder skill.
 */
export function requestedProp(thing: string): Record<string, unknown> {
  const slug = propSlug(thing);
  return {
    format: "crewhub-prop/1",
    id: `user:${slug}`,
    name: thing.charAt(0).toUpperCase() + thing.slice(1),
    description: `Demo placeholder for "${thing}", built by the scripted prop flow.`,
    category: "decor",
    tags: ["demo", "requested"],
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    approaches: [],
    parts: [
      { shape: "box", size: [0.8, 0.6, 0.8], position: [0, 0.3, 0], material: "timber" },
      { shape: "box", size: [0.85, 0.08, 0.85], position: [0, 0.64, 0], material: "chalk" },
      { shape: "sphere", size: [0.3, 0.3, 0.3], position: [0, 0.83, 0], material: "leaf" },
    ],
  };
}
