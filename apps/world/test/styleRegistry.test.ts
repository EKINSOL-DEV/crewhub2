import assert from "node:assert/strict";
import test from "node:test";
import type { StyleManifest, WorldStyle, WorldStyleFactory } from "@crewhub/world-style";
import { createStyleRegistry, PLACEHOLDER_MODEL } from "../src/world/styleRegistry.ts";

/** A style that covers one key and records what it was asked to draw. */
function fakeFactory(id: string, drawn: string[]): WorldStyleFactory {
  const manifest = { id, name: id, version: "1.0.0", description: "", coveredKeys: ["plot"] } as unknown as StyleManifest;
  return {
    manifest,
    create: () =>
      ({
        manifest,
        model: (key: string) => (key === "plot" ? ({ drawn: `${id}:${key}` } as never) : null),
        parts: (prop: { id: string }) => {
          drawn.push(`${id}:parts:${prop.id}`);
          return { drawn: prop.id } as never;
        },
      }) as unknown as WorldStyle,
  };
}

test("a plot with a missing or unknown style id resolves to the town default", () => {
  const registry = createStyleRegistry("greenhouse");
  registry.registerStyle(fakeFactory("greenhouse", []));
  registry.registerStyle(fakeFactory("brutalist", []));
  assert.equal(registry.styleIdFor(undefined), "greenhouse");
  assert.equal(registry.styleIdFor({}), "greenhouse");
  assert.equal(registry.styleIdFor({ styleId: null }), "greenhouse");
  assert.equal(registry.styleIdFor({ styleId: "gothic" }), "greenhouse");
  assert.equal(registry.styleIdFor({ styleId: "brutalist" }), "brutalist");
  assert.equal(registry.styleFor({ styleId: "gothic" }), registry.getStyle("greenhouse"));
  assert.equal(registry.getStyle("brutalist"), registry.getStyle("brutalist"), "one instance per id");
  assert.deepEqual(registry.listStyles().map((m) => m.id), ["greenhouse", "brutalist"]);
});

test("a key the style does not cover draws the neutral placeholder and warns once", () => {
  const drawn: string[] = [];
  const warnings: string[] = [];
  const registry = createStyleRegistry("greenhouse", (m) => warnings.push(m));
  registry.registerStyle(fakeFactory("greenhouse", drawn));
  const style = registry.getStyle("greenhouse");
  assert.deepEqual(style.model("plot"), { drawn: "greenhouse:plot" });
  style.model("drone");
  style.model("drone");
  assert.deepEqual(drawn, [`greenhouse:parts:${PLACEHOLDER_MODEL.id}`, `greenhouse:parts:${PLACEHOLDER_MODEL.id}`]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /does not cover "drone"/);
});

test("a style is dressed in option values: resolved first, one instance per set, and a style without options is itself", () => {
  const asked: Record<string, string>[] = [];
  const options = [{ id: "season", name: "Season", default: "october", values: [{ id: "october", name: "October" }, { id: "spring", name: "Spring" }] }];
  const registry = createStyleRegistry("greenhouse");
  const base = fakeFactory("greenhouse", []);
  registry.registerStyle({
    manifest: { ...base.manifest, options },
    create: () => {
      const style = { ...base.create(), manifest: { ...base.manifest, options } } as WorldStyle;
      style.withOptions = (values) => {
        asked.push({ ...values });
        return { ...style, model: () => ({ drawn: `look:${values.season}` }) as never };
      };
      return style;
    },
  });
  registry.registerStyle(fakeFactory("plain", []));
  const town = registry.getStyle("greenhouse");
  assert.deepEqual(town.options, { season: "october" });
  // The defaults, and picks the style does not know, are the style as it stands.
  assert.equal(town.withOptions({ season: "october" }), town);
  assert.equal(registry.styleFor(null, { season: "winter", weather: "rain" }), town);
  const spring = registry.styleFor(null, { season: "spring", weather: "rain" });
  assert.deepEqual(spring.options, { season: "spring" });
  assert.deepEqual(spring.model("plot"), { drawn: "look:spring" });
  assert.equal(registry.styleFor({ styleOptions: { season: "spring" } }), spring, "one instance per set of values");
  assert.equal(spring.withOptions(null), town);
  assert.deepEqual(asked, [{ season: "spring" }]);
  const plain = registry.getStyle("plain");
  assert.equal(plain.withOptions({ season: "spring" }), plain);
  assert.deepEqual(plain.options, {});
});
