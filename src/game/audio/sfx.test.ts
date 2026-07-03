import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { commands } from "@/ipc/bindings";
import { MUTED_SETTING_KEY, playSfx, resetAudioForTests, useAudio } from "./sfx";

// jsdom has no Web Audio API — real-context behavior (decode, cache) is
// exercised below with this minimal stub, installed per-test.
class FakeAudioContext {
  destination = {};
  state: AudioContextState = "running";
  createBufferSource() {
    return { buffer: null, start: vi.fn(), connect: (dest: unknown) => dest };
  }
  createGain() {
    return { gain: { value: 0 }, connect: (dest: unknown) => dest };
  }
  decodeAudioData(): Promise<unknown> {
    return Promise.resolve({});
  }
  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
}

// WebKit/WKWebView constructs AudioContext already suspended, even from
// inside a gesture handler — a distinct stub so its resume() call can be
// spied on the prototype without disturbing the "running" default above.
class SuspendedFakeAudioContext extends FakeAudioContext {
  override state: AudioContextState = "suspended";
  override resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
}

describe("useAudio store", () => {
  beforeEach(() => resetAudioForTests());

  it("loads a persisted mute state", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "1" } as never);
    await useAudio.getState().init();
    expect(useAudio.getState().muted).toBe(true);
  });

  it("defaults to unmuted when the KV has nothing", async () => {
    await useAudio.getState().init();
    expect(useAudio.getState().muted).toBe(false);
  });

  it("toggleMuted flips state and persists", () => {
    useAudio.getState().toggleMuted();
    expect(useAudio.getState().muted).toBe(true);
    expect(commands.setSetting).toHaveBeenCalledWith(MUTED_SETTING_KEY, "1");

    useAudio.getState().toggleMuted();
    expect(useAudio.getState().muted).toBe(false);
    expect(commands.setSetting).toHaveBeenCalledWith(MUTED_SETTING_KEY, "0");
  });
});

describe("playSfx", () => {
  beforeEach(() => {
    resetAudioForTests();
    vi.unstubAllGlobals();
  });

  it("no-ops without throwing when there's no AudioContext (jsdom default)", () => {
    expect(typeof AudioContext).toBe("undefined");
    expect(() => playSfx("click")).not.toThrow();
  });

  it("no-ops when muted, even with an AudioContext available", () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    useAudio.setState({ muted: true });
    playSfx("click");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches a name's buffer once, then reuses the cache on later plays", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }));

    playSfx("send");
    playSfx("send");
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/assets/sfx/send.ogg");
  });

  it("silently no-ops when the file fetch fails", async () => {
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    expect(() => playSfx("hire")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("resumes a suspended context before scheduling playback (WebKit ships AudioContext suspended even inside a gesture handler)", async () => {
    const resumeSpy = vi.spyOn(SuspendedFakeAudioContext.prototype, "resume");
    vi.stubGlobal("AudioContext", SuspendedFakeAudioContext);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new ArrayBuffer(8), { status: 200 }));

    playSfx("click");
    await Promise.resolve();
    await Promise.resolve();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/assets/sfx/click.ogg");
  });
});
