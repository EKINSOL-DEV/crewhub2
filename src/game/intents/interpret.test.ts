import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    worldGenerateProp: vi.fn(async () => ({
      status: "ok",
      data: { session_id: "s1", status: "success", text: '{"action":"none"}' },
    })),
  },
}));

vi.mock("@/game/flavor/engine", () => ({
  flavorEnabled: vi.fn(() => true),
  flavorModel: vi.fn(() => "haiku"),
  bumpFlavorRuns: vi.fn(),
}));

import { commands } from "@/ipc/bindings";
import { bumpFlavorRuns, flavorEnabled, flavorModel } from "@/game/flavor/engine";
import { buildInterpretPrompt, interpretIntent, parseInterpretReply } from "./interpret";
import type { IntentContext } from "./parse";

const noRooms: IntentContext = { rooms: [] };

function ctxWith(...names: string[]): IntentContext {
  return { rooms: names.map((name, i) => ({ buildingKey: `b${i}`, name })) };
}

describe("buildInterpretPrompt", () => {
  it("is deterministic for the same input", () => {
    const ctx = ctxWith("Website Redesign");
    expect(buildInterpretPrompt("go dance", ctx)).toBe(buildInterpretPrompt("go dance", ctx));
  });

  it("mentions the user's text and the goto/emote/say/none shapes", () => {
    const prompt = buildInterpretPrompt("do a little jig", noRooms);
    expect(prompt).toContain("do a little jig");
    expect(prompt).toContain('"action":"goto"');
    expect(prompt).toContain('"action":"emote"');
    expect(prompt).toContain('"action":"say"');
    expect(prompt).toContain('"action":"none"');
  });

  it("includes hq and plaza plus room names in the target catalog", () => {
    const prompt = buildInterpretPrompt("hello", ctxWith("Website Redesign"));
    expect(prompt).toContain("hq");
    expect(prompt).toContain("plaza");
    expect(prompt).toContain("Website Redesign");
  });

  it("clamps the room catalog to 24 names", () => {
    const rooms = Array.from({ length: 40 }, (_, i) => `Room ${i}`);
    const prompt = buildInterpretPrompt("hello", ctxWith(...rooms));
    expect(prompt).toContain("Room 23");
    expect(prompt).not.toContain("Room 24");
  });

  it("clamps an overlong room name to 40 characters", () => {
    const longName = "R".repeat(80);
    const prompt = buildInterpretPrompt("hello", ctxWith(longName));
    expect(prompt).toContain("R".repeat(40));
    expect(prompt).not.toContain("R".repeat(41));
  });

  it("safely embeds quotes in the user's text", () => {
    const prompt = buildInterpretPrompt('he said "hi" to me', noRooms);
    expect(() => prompt).not.toThrow();
    expect(prompt).toContain('he said \\"hi\\" to me');
  });
});

describe("parseInterpretReply", () => {
  it("parses a goto hq reply", () => {
    expect(parseInterpretReply('{"action":"goto","target":"hq"}', noRooms)).toEqual({
      kind: "goto",
      target: { type: "hq" },
    });
  });

  it("parses a goto plaza reply, case-insensitively", () => {
    expect(parseInterpretReply('{"action":"goto","target":"PLAZA"}', noRooms)).toEqual({
      kind: "goto",
      target: { type: "plaza" },
    });
  });

  it("parses a goto room reply matching the catalog", () => {
    const ctx = ctxWith("Website Redesign");
    expect(parseInterpretReply('{"action":"goto","target":"Website Redesign"}', ctx)).toEqual({
      kind: "goto",
      target: { type: "room", buildingKey: "b0" },
    });
  });

  it("returns null for an unknown target", () => {
    expect(parseInterpretReply('{"action":"goto","target":"nowhere"}', ctxWith("Website"))).toBeNull();
  });

  it("returns null for an ambiguous target", () => {
    const ctx = ctxWith("Website", "Website Redesign");
    expect(parseInterpretReply('{"action":"goto","target":"website"}', ctx)).toBeNull();
  });

  it("parses a valid emote reply", () => {
    expect(parseInterpretReply('{"action":"emote","emote":"dance"}', noRooms)).toEqual({
      kind: "emote",
      emote: "dance",
    });
  });

  it("returns null for an invalid emote", () => {
    expect(parseInterpretReply('{"action":"emote","emote":"backflip"}', noRooms)).toBeNull();
  });

  it("parses a valid say reply", () => {
    expect(parseInterpretReply('{"action":"say","text":"hello there"}', noRooms)).toEqual({
      kind: "say",
      text: "hello there",
    });
  });

  it("clamps an oversized say text to 200 characters", () => {
    const long = "a".repeat(300);
    const result = parseInterpretReply(`{"action":"say","text":"${long}"}`, noRooms);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("say");
    expect((result as { text: string }).text.length).toBe(200);
  });

  it("returns null for error-ish say text", () => {
    expect(parseInterpretReply('{"action":"say","text":"Error: overloaded"}', noRooms)).toBeNull();
  });

  it("returns null for the none action", () => {
    expect(parseInterpretReply('{"action":"none"}', noRooms)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseInterpretReply("not json at all", noRooms)).toBeNull();
  });

  it("returns null for an unrecognized action", () => {
    expect(parseInterpretReply('{"action":"explode"}', noRooms)).toBeNull();
  });

  it("returns null when action is missing", () => {
    expect(parseInterpretReply("{}", noRooms)).toBeNull();
  });

  it("tolerates a fenced json code block", () => {
    const raw = '```json\n{"action":"emote","emote":"wave"}\n```';
    expect(parseInterpretReply(raw, noRooms)).toEqual({ kind: "emote", emote: "wave" });
  });

  it("tolerates a bare fenced code block without a json tag", () => {
    const raw = '```\n{"action":"emote","emote":"cheer"}\n```';
    expect(parseInterpretReply(raw, noRooms)).toEqual({ kind: "emote", emote: "cheer" });
  });

  it("tolerates prose wrapped around the JSON", () => {
    const raw = 'Sure, here you go: {"action":"emote","emote":"spin"} — hope that helps!';
    expect(parseInterpretReply(raw, noRooms)).toEqual({ kind: "emote", emote: "spin" });
  });
});

describe("interpretIntent", () => {
  beforeEach(() => {
    vi.mocked(flavorEnabled).mockReset().mockReturnValue(true);
    vi.mocked(flavorModel).mockReset().mockReturnValue("haiku");
    vi.mocked(bumpFlavorRuns).mockReset();
    vi.mocked(commands.worldGenerateProp)
      .mockReset()
      .mockResolvedValue({
        status: "ok",
        data: { session_id: "s1", status: "success", text: '{"action":"none"}' },
      } as never);
  });

  it("calls worldGenerateProp with the built prompt and configured model, returning the parsed intent", async () => {
    vi.mocked(commands.worldGenerateProp).mockResolvedValueOnce({
      status: "ok",
      data: { session_id: "s1", status: "success", text: '{"action":"emote","emote":"dance"}' },
    } as never);

    const result = await interpretIntent("do a little jig", noRooms);

    expect(result).toEqual({ kind: "emote", emote: "dance" });
    expect(commands.worldGenerateProp).toHaveBeenCalledWith(
      expect.stringContaining("do a little jig"),
      "haiku",
    );
    expect(bumpFlavorRuns).toHaveBeenCalledTimes(1);
  });

  it("returns null and does not call the model when flavor is disabled", async () => {
    vi.mocked(flavorEnabled).mockReturnValue(false);
    const result = await interpretIntent("do a little jig", noRooms);
    expect(result).toBeNull();
    expect(commands.worldGenerateProp).not.toHaveBeenCalled();
    expect(bumpFlavorRuns).not.toHaveBeenCalled();
  });

  it("returns null on an IPC error, without bumping runs", async () => {
    vi.mocked(commands.worldGenerateProp).mockResolvedValueOnce({ status: "error", error: "boom" } as never);
    const result = await interpretIntent("do a little jig", noRooms);
    expect(result).toBeNull();
    expect(bumpFlavorRuns).not.toHaveBeenCalled();
  });

  it("returns null when the model declines (none), without bumping runs", async () => {
    const result = await interpretIntent("what time is it", noRooms);
    expect(result).toBeNull();
    expect(bumpFlavorRuns).not.toHaveBeenCalled();
  });

  it("returns null and swallows a thrown error from the binding", async () => {
    vi.mocked(commands.worldGenerateProp).mockRejectedValueOnce(new Error("network down"));
    const result = await interpretIntent("do a little jig", noRooms);
    expect(result).toBeNull();
    expect(bumpFlavorRuns).not.toHaveBeenCalled();
  });

  it("drops a concurrent call while one interpretation is in flight", async () => {
    let resolveFirst!: (v: unknown) => void;
    vi.mocked(commands.worldGenerateProp).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }) as never,
    );

    const first = interpretIntent("do a little jig", noRooms);
    const second = interpretIntent("go to hq", noRooms);

    await expect(second).resolves.toBeNull();
    expect(commands.worldGenerateProp).toHaveBeenCalledTimes(1);

    resolveFirst({
      status: "ok",
      data: { session_id: "s1", status: "success", text: '{"action":"emote","emote":"dance"}' },
    });
    await expect(first).resolves.toEqual({ kind: "emote", emote: "dance" });

    // in-flight slot freed — a later call goes through
    const third = interpretIntent("go to hq", noRooms);
    await expect(third).resolves.toBeNull(); // "none" per the default mock reply
    expect(commands.worldGenerateProp).toHaveBeenCalledTimes(2);
  });
});
