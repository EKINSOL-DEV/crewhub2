/* The sprouts' postman rides under its dandelion on its rounds. The end of a walk must set it down, not drop it. */
import assert from "node:assert/strict";
import test from "node:test";
import { IDLE_STATE } from "@crewhub/world-cast";
import { castRegistry } from "../src/world/cast.ts";

const FRAME = 1 / 60;

test("the sprouts' postman takes off and lands without a jump", () => {
  const cast = castRegistry.castFor({ manifest: { id: "reference" } }, "sprouts");
  assert.equal(cast.manifest.id, "sprouts");
  const figure = cast.figure({ key: "postman", role: "postman", accent: null });
  // The body joint is the one the bean hangs on; its height over the standing pose is the drift.
  let body: { position: { y: number } } | null = null;
  figure.object.traverse((o) => {
    if (!body && o.children.some((c) => (c as { isMesh?: boolean }).isMesh) && o !== figure.object) body = o;
  });
  assert.ok(body);
  const height = () => body!.position.y;
  figure.setState(IDLE_STATE);
  const standing = height();

  figure.setState({ ...IDLE_STATE, activity: "walking" });
  let top = 0;
  for (let i = 0; i < 120; i++) {
    figure.update(FRAME);
    top = Math.max(top, height() - standing);
  }
  assert.ok(top > 0.1, `it rides in the air on its rounds (${top})`);

  // The walk ends: frame by frame the height comes down in small steps, to exactly the standing pose.
  figure.setState(IDLE_STATE);
  let last = Number.POSITIVE_INFINITY;
  let frames = 0;
  for (let i = 0; i < 60; i++) {
    figure.update(FRAME);
    const over = height() - standing;
    if (i === 0) assert.ok(over > 0.09, `the first standing frame is still in the air (${over})`);
    else assert.ok(last - over >= -0.011 && last - over < 0.012, `frame ${i} steps ${last - over}`);
    if (over > 0.011) frames++;
    last = over;
  }
  assert.ok(frames >= 10, `the landing takes time (${frames} frames)`);
  // Standing on: the idle sway only, nothing piles up or sinks.
  for (let i = 0; i < 600; i++) figure.update(FRAME);
  assert.ok(Math.abs(height() - standing) <= 0.0081, `back on the ground (${height() - standing})`);
});
