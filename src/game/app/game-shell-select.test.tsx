// M8 T3: bot-click composition — a clicked robot always calls followBot()
// (the camera director's real store, exercised directly rather than mocked
// — same tolerance as game-shell-escape.test.tsx and hud-camera-exit.test.tsx)
// alongside whichever of hire/chat its key routes to. selectCharacter is
// pulled out of GameShell's onSelect prop specifically so this can run
// without a real R3F canvas — see its own doc comment in GameShell.tsx.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  const useGLTF = Object.assign(real.useGLTF, { preload: vi.fn() });
  return { ...real, useGLTF };
});

vi.mock("@/game/audio/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/game/audio/sfx")>();
  return { ...actual, playSfx: vi.fn() };
});

import { selectCharacter } from "./GameShell";
import { useCameraDirector } from "@/game/engine/camera/director";
import { useGameChats } from "@/game/chat/store";

function deps() {
  return {
    setHireAgentId: vi.fn(),
    setHireOpen: vi.fn(),
  };
}

describe("selectCharacter", () => {
  beforeEach(() => {
    useCameraDirector.setState({ mode: { kind: "free" } });
    useGameChats.setState({ chats: [] });
  });

  it("follows the bot with the camera regardless of which branch the key takes", () => {
    selectCharacter("claude:1", deps());
    expect(useCameraDirector.getState().mode).toEqual({ kind: "follow", botKey: "claude:1" });
  });

  it("an agent: key opens the hire dialog preselected to that agent, and does not open a chat", () => {
    const d = deps();
    selectCharacter("agent:robo-1", d);

    expect(d.setHireAgentId).toHaveBeenCalledWith("robo-1");
    expect(d.setHireOpen).toHaveBeenCalledWith(true);
    expect(useGameChats.getState().chats).toHaveLength(0);
    expect(useCameraDirector.getState().mode).toEqual({ kind: "follow", botKey: "agent:robo-1" });
  });

  // M8 T3 fix wave: the one-shot `setFocus` snap this used to also fire is
  // gone — followBot() alone both frames the bot and keeps tracking it, and
  // the old prop's synchronous snap raced the rig's free -> follow entry
  // edge, corrupting the restore snapshot (see GameCameraRig.tsx's doc
  // comment on the removed `focus` prop).
  it("a session key opens its chat, without touching hire state", () => {
    const d = deps();
    selectCharacter("claude:1", d);

    expect(useGameChats.getState().chats.map((c) => c.key)).toEqual(["claude:1"]);
    expect(d.setHireAgentId).not.toHaveBeenCalled();
    expect(d.setHireOpen).not.toHaveBeenCalled();
  });

  it("clicking a second bot re-follows the new one (follow replaces follow)", () => {
    selectCharacter("claude:1", deps());
    selectCharacter("claude:2", deps());
    expect(useCameraDirector.getState().mode).toEqual({ kind: "follow", botKey: "claude:2" });
  });
});
