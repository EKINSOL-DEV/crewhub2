// Status → glow mapping (EKI-66): mirrors the StatusEmoji critter semantics —
// Working pulses, WaitingForPermission bounces ("look at me"), Idle is dim.
import { describe, expect, it } from "vitest";
import type { SessionStatus } from "@/ipc/bindings";
import { STATUS_GLOWS, statusGlow } from "./status";

const ALL: SessionStatus[] = ["Working", "WaitingForInput", "WaitingForPermission", "Idle", "Ended"];

describe("statusGlow", () => {
  it("covers every SessionStatus with a hex color", () => {
    for (const s of ALL) {
      const g = statusGlow(s);
      expect(g.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(g.label.length).toBeGreaterThan(0);
    }
  });

  it("matches the critter animation semantics: Working pulses, Permission bounces", () => {
    expect(statusGlow("Working").anim).toBe("pulse");
    expect(statusGlow("WaitingForPermission").anim).toBe("bounce");
    expect(statusGlow("WaitingForInput").anim).toBe("none");
    expect(statusGlow("Idle").anim).toBe("none");
    expect(statusGlow("Ended").anim).toBe("none");
  });

  it("dims idle and ended bots below active ones", () => {
    expect(statusGlow("Idle").intensity).toBeLessThan(statusGlow("Working").intensity);
    expect(statusGlow("Ended").intensity).toBeLessThan(statusGlow("Idle").intensity);
  });

  it("exposes the full table for legend UIs", () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(Object.keys(STATUS_GLOWS).sort(byName)).toEqual([...ALL].sort(byName));
  });
});
