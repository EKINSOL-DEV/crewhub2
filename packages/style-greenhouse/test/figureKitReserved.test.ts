/* The contract's reserved colour names (world-cast `RESERVED_COLORS`) in the Greenhouse kit: each is a swatch of the style's, and a cast's own colour of that name wins. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RESERVED_COLORS, type ReservedColor } from "@crewhub/world-cast";
import { figureKit } from "../src/figureKit.ts";
import { Kit, type GreenhouseManifestData } from "../src/kit.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { lighting: ConstructorParameters<typeof Kit>[1] };
const SWATCHES: Record<ReservedColor, string> = { alert: "beacon", stale: "grey-bot" };

test("every reserved name is a Greenhouse swatch; a cast's own colour of that name wins", () => {
  const kit = new Kit(manifest, manifest.lighting);
  const plain = figureKit(kit, { id: "reserved-plain", colors: {} });
  for (const name of RESERVED_COLORS) assert.equal(plain.hex(name), kit.hex(SWATCHES[name]), name);
  const own = figureKit(kit, { id: "reserved-own", colors: { alert: { day: "#123456", lamplight: "#123456" } } });
  assert.equal(own.hex("alert"), "#123456");
  assert.equal(own.hex("stale"), kit.hex("grey-bot"));
});
