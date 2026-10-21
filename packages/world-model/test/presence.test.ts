/** The presence settings' two director switches: the demo's, and the live opt-in that is never implied by it. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PRESENCE, effectivePresence, normalizePresence } from "../src/presence.ts";

test("the live director is off by default and off whatever a stored value says unless it says true", () => {
  assert.equal(DEFAULT_PRESENCE.liveDirectorEnabled, false);
  assert.equal(normalizePresence({}).liveDirectorEnabled, false);
  assert.equal(normalizePresence({ liveDirectorEnabled: "true" }).liveDirectorEnabled, false);
  assert.equal(normalizePresence({ liveDirectorEnabled: 1 }).liveDirectorEnabled, false);
  assert.equal(normalizePresence({ liveDirectorEnabled: true }).liveDirectorEnabled, true);
});

test("the demo's switch left on does not switch the live director on, and the other way round", () => {
  const demoOn = normalizePresence({ directorEnabled: true });
  assert.equal(effectivePresence(demoOn, "demo").directorEnabled, true);
  assert.equal(effectivePresence(demoOn, "live").directorEnabled, false);
  const liveOn = normalizePresence({ liveDirectorEnabled: true });
  assert.equal(effectivePresence(liveOn, "live").directorEnabled, true);
  assert.equal(effectivePresence(liveOn, "demo").directorEnabled, false);
});

test("the effective settings keep every bound and are the same object when nothing changes", () => {
  const stored = normalizePresence({ directorEnabled: true, liveDirectorEnabled: true, intervalMinutes: 7, plansPerHour: 3 });
  assert.equal(effectivePresence(stored, "live"), stored);
  assert.equal(effectivePresence(stored, "demo"), stored);
  const live = effectivePresence(normalizePresence({ liveDirectorEnabled: true, intervalMinutes: 7, plansPerHour: 3 }), "live");
  assert.deepEqual([live.intervalMinutes, live.plansPerHour, live.quickPlans, live.liveDirectorEnabled], [7, 3, true, true]);
});
