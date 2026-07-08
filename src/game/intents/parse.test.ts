import { describe, expect, it } from "vitest";
import { parseIntent, resolveRoom, type IntentContext } from "./parse";

const noRooms: IntentContext = { rooms: [] };

function ctxWith(...names: string[]): IntentContext {
  return { rooms: names.map((name, i) => ({ buildingKey: `b${i}`, name })) };
}

describe("parseIntent — goto hq", () => {
  it.each([
    "go to hq",
    "go to the hq",
    "go to headquarters",
    "go to the headquarters",
    "go to home base",
    "go to the home base",
  ])("%s -> goto hq", (text) => {
    expect(parseIntent(text, noRooms)).toEqual({ kind: "goto", target: { type: "hq" } });
  });

  it("is case-insensitive", () => {
    expect(parseIntent("GO TO THE HEADQUARTERS", noRooms)).toEqual({ kind: "goto", target: { type: "hq" } });
  });

  it("tolerates a trailing exclamation mark", () => {
    expect(parseIntent("go to hq!", noRooms)).toEqual({ kind: "goto", target: { type: "hq" } });
  });
});

describe("parseIntent — goto plaza", () => {
  it.each([
    "go to plaza",
    "go to the plaza",
    "go to center",
    "go to the center",
    "go to fountain",
    "go to the fountain",
  ])("%s -> goto plaza", (text) => {
    expect(parseIntent(text, noRooms)).toEqual({ kind: "goto", target: { type: "plaza" } });
  });

  it.each(["come out", "go outside", "Come Out!", "GO OUTSIDE"])(
    "%s -> goto plaza (outside phrasing)",
    (text) => {
      expect(parseIntent(text, noRooms)).toEqual({ kind: "goto", target: { type: "plaza" } });
    },
  );
});

describe("parseIntent — goto room", () => {
  it("matches a room by case-insensitive whole-name prefix", () => {
    const ctx = ctxWith("Website Redesign");
    expect(parseIntent("go to website redesign", ctx)).toEqual({
      kind: "goto",
      target: { type: "room", buildingKey: "b0" },
    });
  });

  it("matches a room by a word-prefix of its second word", () => {
    const ctx = ctxWith("Website Redesign");
    expect(parseIntent("go to the redesign", ctx)).toEqual({
      kind: "goto",
      target: { type: "room", buildingKey: "b0" },
    });
  });

  it("returns null when the name matches no room", () => {
    const ctx = ctxWith("Website Redesign");
    expect(parseIntent("go to nowhere", ctx)).toBeNull();
  });

  it("returns null when the name is ambiguous between two rooms", () => {
    const ctx = ctxWith("Website", "Website Redesign");
    expect(parseIntent("go to website", ctx)).toBeNull();
  });

  it("returns null with no rooms configured", () => {
    expect(parseIntent("go to the store", noRooms)).toBeNull();
  });

  it("matches a word-prefix of a room's first word (CrewHub)", () => {
    const ctx = ctxWith("CrewHub Docs");
    expect(parseIntent("go to crew", ctx)).toEqual({
      kind: "goto",
      target: { type: "room", buildingKey: "b0" },
    });
  });

  it("does not match a mid-word substring across a word boundary", () => {
    // "main" is a substring of "Domain" but not a prefix of it or of
    // "Migration" — must not match, unlike the old includes()-based check.
    const ctx = ctxWith("Domain Migration");
    expect(parseIntent("go to main", ctx)).toBeNull();
  });

  it("still resolves a genuine word-prefix match when a substring trap room is also present", () => {
    // "Domain Migration" is a decoy that must NOT match "main"; "Main Campus"
    // is the real, unambiguous word-prefix match and must still resolve.
    const ctx = ctxWith("Domain Migration", "Main Campus");
    expect(parseIntent("go to main", ctx)).toEqual({
      kind: "goto",
      target: { type: "room", buildingKey: "b1" },
    });
  });
});

describe("parseIntent — emote", () => {
  it.each(["dance", "spin", "cheer", "wave"])("%s -> emote", (emote) => {
    expect(parseIntent(emote, noRooms)).toEqual({ kind: "emote", emote });
  });

  it.each(["do a dance", "do a spin", "do a cheer", "do a wave"])("%s -> emote (do a prefix)", (text) => {
    expect(parseIntent(text, noRooms)).not.toBeNull();
  });

  it.each(["dance for me", "spin for me", "cheer for me", "wave for me"])(
    "%s -> emote (for me suffix)",
    (text) => {
      expect(parseIntent(text, noRooms)).not.toBeNull();
    },
  );

  it("combines the do-a prefix, for-me suffix, and exclamation", () => {
    expect(parseIntent("do a dance for me!", noRooms)).toEqual({ kind: "emote", emote: "dance" });
  });

  it("is case-insensitive", () => {
    expect(parseIntent("DANCE", noRooms)).toEqual({ kind: "emote", emote: "dance" });
  });

  it("tolerates a trailing exclamation mark", () => {
    expect(parseIntent("spin!", noRooms)).toEqual({ kind: "emote", emote: "spin" });
  });
});

describe("parseIntent — anti-false-positives", () => {
  it("does not match ordinary sentences mentioning 'go to'", () => {
    expect(parseIntent("let's go to production", noRooms)).toBeNull();
  });

  it("does not match a long sentence with a 'go to' clause buried in it", () => {
    expect(parseIntent("can you go to the store and buy milk", noRooms)).toBeNull();
  });

  it("does not match a long sentence merely containing 'dance'", () => {
    expect(parseIntent("I love watching people dance at parties downtown tonight", noRooms)).toBeNull();
  });

  it("does not match 'dance' embedded in a short but non-anchored phrase", () => {
    expect(parseIntent("let's dance", noRooms)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseIntent("", noRooms)).toBeNull();
  });

  it("returns null for whitespace-only text", () => {
    expect(parseIntent("   ", noRooms)).toBeNull();
  });

  it("returns null for unrelated chit-chat", () => {
    expect(parseIntent("how's the weather today", noRooms)).toBeNull();
  });

  it("returns null once the message exceeds the word limit even if it starts like a command", () => {
    const ctx = ctxWith("Store");
    expect(parseIntent("go to the store please because I really need something there", ctx)).toBeNull();
  });
});

describe("resolveRoom", () => {
  it("returns null for an empty needle", () => {
    expect(resolveRoom("", ctxWith("Anything").rooms)).toBeNull();
  });
});
