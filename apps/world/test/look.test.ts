import assert from "node:assert/strict";
import test from "node:test";
import { LOOK_ORDER, lookKey, optionLayers, resolveLook } from "../src/world/look.ts";
import type { LookRegistries } from "../src/world/look.ts";

const registries: LookRegistries = {
  styles: {
    defaultId: "greenhouse",
    has: (id) => id === "greenhouse" || id === "harbour",
    manifest: (id) =>
      id === "harbour"
        ? { defaultCast: "sprouts" }
        : {
            defaultCast: "classic-bots",
            options: [
              { id: "season", default: "october", values: [{ id: "october" }, { id: "spring" }, { id: "summer" }] },
              { id: "planting", default: "meadow", values: [{ id: "meadow" }, { id: "orchard" }, { id: "market" }] },
            ],
          },
  },
  casts: { fallbackId: "classic-bots", has: (id) => ["classic-bots", "sprouts", "potlings"].includes(id) },
};

test("the order is building, zone, viewer, town, style", () => {
  assert.deepEqual([...LOOK_ORDER], ["building", "zone", "viewer", "town", "style"]);
});

test("with nothing asked, a look is the style's defaults", () => {
  assert.deepEqual(resolveLook({}, registries), {
    styleId: "greenhouse",
    styleOptions: { season: "october", planting: "meadow" },
    castId: "classic-bots",
    from: { styleId: "style", castId: "style", styleOptions: { season: "style", planting: "style" } },
    unknown: { casts: [], styles: [] },
  });
});

test("the cast: a building's own wins over its zone's, the zone's over the viewer's, the viewer's over the town's", () => {
  const cast = (layers: Parameters<typeof resolveLook>[0]) => {
    const look = resolveLook(layers, registries);
    return [look.castId, look.from.castId];
  };
  const all = { building: { castId: "potlings" }, zone: { castId: "sprouts" }, viewer: { castId: "classic-bots" }, town: { castId: "sprouts" } };
  assert.deepEqual(cast(all), ["potlings", "building"]);
  assert.deepEqual(cast({ ...all, building: null }), ["sprouts", "zone"]);
  assert.deepEqual(cast({ viewer: all.viewer, town: all.town }), ["classic-bots", "viewer"]);
  assert.deepEqual(cast({ town: all.town }), ["sprouts", "town"]);
  // The viewer's choice yields to a zone that sets a cast, and only to that zone.
  assert.deepEqual(cast({ zone: {}, viewer: { castId: "potlings" } }), ["potlings", "viewer"]);
});

test("each option falls through on its own, and a value the style does not declare falls through too", () => {
  const look = resolveLook(
    {
      building: { styleOptions: { planting: "orchard" } },
      zone: { styleOptions: { season: "spring", planting: "market", weather: "rain" } },
      viewer: { styleOptions: { season: "summer" } },
      town: { styleOptions: { season: "october" } },
    },
    registries,
  );
  assert.deepEqual(look.styleOptions, { season: "spring", planting: "orchard" });
  assert.deepEqual(look.from.styleOptions, { season: "zone", planting: "building" });
  assert.equal("weather" in look.styleOptions, false, "an option the style does not know is ignored");

  const stale = resolveLook({ zone: { styleOptions: { season: "monsoon" } }, viewer: { styleOptions: { season: "summer" } } }, registries);
  assert.deepEqual([stale.styleOptions.season, stale.from.styleOptions.season], ["summer", "viewer"]);
});

test("the style id resolves first: options and the default cast are those of the style that won", () => {
  const look = resolveLook({ zone: { styleId: "harbour", styleOptions: { season: "spring" } }, town: { styleId: "greenhouse" } }, registries);
  assert.equal(look.styleId, "harbour");
  assert.equal(look.from.styleId, "zone");
  assert.deepEqual(look.styleOptions, {}, "harbour declares no options: Greenhouse's season means nothing to it");
  assert.deepEqual([look.castId, look.from.castId], ["sprouts", "style"]);
});

test("ids nobody registered fall through and are named once", () => {
  const look = resolveLook(
    { building: { styleId: "castle", castId: "elves" }, zone: { castId: "elves" }, viewer: { castId: "ghosts" }, town: { castId: "sprouts", styleId: "castle" } },
    registries,
  );
  assert.equal(look.styleId, "greenhouse");
  assert.equal(look.castId, "sprouts");
  assert.deepEqual(look.unknown, { casts: ["elves", "ghosts"], styles: ["castle"] });
});

test("option layers come most specific first, empty ones left out; equal looks share a key", () => {
  assert.deepEqual(optionLayers({ town: { styleOptions: { season: "spring" } }, zone: { styleOptions: { season: "summer" } }, viewer: { styleOptions: {} }, building: null }), [
    { season: "summer" },
    { season: "spring" },
  ]);
  const a = resolveLook({ zone: { styleOptions: { season: "spring" } } }, registries);
  const b = resolveLook({ viewer: { styleOptions: { season: "spring", planting: "meadow" } } }, registries);
  assert.equal(lookKey(a), lookKey(b));
  assert.notEqual(lookKey(a), lookKey(resolveLook({}, registries)));
});
