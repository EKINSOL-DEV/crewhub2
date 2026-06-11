import { describe, expect, it } from "vitest";
import { isHexColor, WORLD_PALETTE_FALLBACK } from "../lib/theme-palette";
import { CORE_PROPS, FALLBACK_PROP_ID, matchPropId, PROP_LIST, propColors, resolveProp } from "./registry";

describe("prop registry", () => {
  it("ships at least 10 namespaced core props", () => {
    expect(PROP_LIST.length).toBeGreaterThanOrEqual(10);
    for (const def of PROP_LIST) {
      expect(def.id).toMatch(/^core:[a-z-]+$/);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.emoji.length).toBeGreaterThan(0);
      expect(def.parts.length).toBeGreaterThan(0);
      expect(def.radius).toBeGreaterThan(0);
    }
  });

  it("has unique ids", () => {
    const ids = PROP_LIST.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the expected core set", () => {
    for (const key of [
      "core:desk",
      "core:chair",
      "core:plant",
      "core:bookshelf",
      "core:lamp",
      "core:rug",
      "core:coffee",
      "core:whiteboard",
      "core:couch",
      "core:crate",
    ]) {
      expect(CORE_PROPS[key], key).toBeDefined();
    }
  });

  it("every part's color role resolves to a hex color from the theme palette", () => {
    const colors = propColors(WORLD_PALETTE_FALLBACK);
    for (const def of PROP_LIST) {
      for (const part of def.parts) {
        expect(isHexColor(colors[part.color]), `${def.id} role ${part.color}`).toBe(true);
      }
    }
  });

  it("part sizes match their primitive arity", () => {
    const arity = { box: 3, cylinder: 3, sphere: 1, cone: 2 } as const;
    for (const def of PROP_LIST) {
      for (const part of def.parts) {
        expect(part.size.length, `${def.id} ${part.shape}`).toBe(arity[part.shape]);
        for (const n of part.size) expect(n).toBeGreaterThan(0);
      }
    }
  });

  describe("resolveProp", () => {
    it("returns the definition for known ids", () => {
      expect(resolveProp("core:desk").id).toBe("core:desk");
    });
    it("falls back to the crate for unknown ids", () => {
      expect(resolveProp("mod:gold-throne").id).toBe(FALLBACK_PROP_ID);
    });
  });

  describe("matchPropId (v1 id → core prop)", () => {
    it.each([
      ["desk-with-monitor", "core:desk"],
      ["desk-with-dual-monitors", "core:desk"],
      ["standing-desk", "core:desk"],
      ["conference-table", "core:desk"],
      ["office-chair", "core:chair"],
      ["plant-large", "core:plant"],
      ["flower-pot", "core:plant"],
      ["bookshelf-tall", "core:bookshelf"],
      ["filing-cabinet", "core:bookshelf"],
      ["lamp-floor", "core:lamp"],
      ["ceiling-light", "core:lamp"],
      ["rug-large", "core:rug"],
      ["coffee-machine", "core:coffee"],
      ["vending-machine", "core:coffee"],
      ["whiteboard", "core:whiteboard"],
      ["notice-board", "core:whiteboard"],
      ["monitor-wall", "core:whiteboard"],
      ["couch-l-shaped", "core:couch"],
      ["bunk-bed", "core:couch"],
    ])("%s → %s", (v1Id, coreId) => {
      expect(matchPropId(v1Id)).toBe(coreId);
    });

    it("returns null for ids with no keyword overlap", () => {
      expect(matchPropId("satellite-dish")).toBeNull();
      expect(matchPropId("")).toBeNull();
    });
  });

  describe("propColors", () => {
    it("is theme-aware: accent-driven roles follow the palette accent", () => {
      const a = propColors({ ...WORLD_PALETTE_FALLBACK, accent: "#ff0000" });
      const b = propColors({ ...WORLD_PALETTE_FALLBACK, accent: "#0000ff" });
      expect(a.fabric).not.toBe(b.fabric);
      expect(a.accent).not.toBe(b.accent);
      expect(a.shade).not.toBe(b.shade);
    });

    it("keeps natural roles stable across themes (wood/foliage stay woody/leafy)", () => {
      const a = propColors(WORLD_PALETTE_FALLBACK);
      const b = propColors({ ...WORLD_PALETTE_FALLBACK, accent: "#00ffcc" });
      expect(a.foliage).toBe(b.foliage);
    });
  });
});
