// M8 T3: bot-click composition — a clicked robot always calls followBot()
// (the camera director's real store, exercised directly rather than mocked
// — same tolerance as game-shell-escape.test.tsx and camera-exit-pill.test.tsx)
// alongside whichever of hire/chat its key routes to. selectCharacter is
// pulled out of GameShell's onSelect prop specifically so this can run
// without a real R3F canvas — see its own doc comment in GameShell.tsx.
//
// Round 2: selectCharacter no longer takes a `deps` param — a click always
// opens the dossier dock (mode.ts's real, unmocked roomCard slot) alongside
// follow, and no longer force-opens the hire dialog directly for resting
// (`agent:`) crew (that would stack it on top of the dossier the same click
// just opened — see the file's own doc comment).
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
import { useBuildMode } from "@/game/build/mode";
import { useCameraDirector } from "@/game/engine/camera/director";
import { useGameChats } from "@/game/chat/store";

describe("selectCharacter", () => {
  beforeEach(() => {
    useCameraDirector.setState({ mode: { kind: "free" } });
    useGameChats.setState({ chats: [] });
    useBuildMode.setState({ roomCard: null, cameraCoupledCard: null });
  });

  it("follows the bot with the camera regardless of which branch the key takes", () => {
    selectCharacter("claude:1");
    expect(useCameraDirector.getState().mode).toEqual({ kind: "follow", botKey: "claude:1" });
  });

  it("always opens the bot's dossier dock, live session or resting crew alike", () => {
    selectCharacter("claude:1");
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "dossier", key: "claude:1" });

    selectCharacter("agent:robo-1");
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "dossier", key: "agent:robo-1" });
  });

  it("an agent: key does not open a chat, and does not touch the hire dialog directly", () => {
    selectCharacter("agent:robo-1");

    expect(useGameChats.getState().chats).toHaveLength(0);
    // The dossier's own "👥 Hire" button (DossierCard) is the route to hire
    // now, not a direct force-open — see the roomCard assertion above.
    expect(useBuildMode.getState().roomCard?.kind).toBe("dossier");
    expect(useCameraDirector.getState().mode).toEqual({ kind: "follow", botKey: "agent:robo-1" });
  });

  // M8 T3 fix wave: the one-shot `setFocus` snap this used to also fire is
  // gone — followBot() alone both frames the bot and keeps tracking it, and
  // the old prop's synchronous snap raced the rig's free -> follow entry
  // edge, corrupting the restore snapshot (see GameCameraRig.tsx's doc
  // comment on the removed `focus` prop).
  it("a session key opens its chat, alongside the dossier", () => {
    selectCharacter("claude:1");

    expect(useGameChats.getState().chats.map((c) => c.key)).toEqual(["claude:1"]);
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "dossier", key: "claude:1" });
  });

  it("clicking a second bot re-follows the new one (follow replaces follow) and re-targets the dossier", () => {
    selectCharacter("claude:1");
    selectCharacter("claude:2");
    expect(useCameraDirector.getState().mode).toEqual({ kind: "follow", botKey: "claude:2" });
    expect(useBuildMode.getState().roomCard).toEqual({ kind: "dossier", key: "claude:2" });
  });

  // Round 3 fix: selectCharacter's own dossier open is the one GameShell's
  // mode->free effect is allowed to auto-close later, since this same click
  // also follows the bot — see mode.ts's `cameraCoupledCard` doc comment
  // and game-shell-escape.test.tsx's "focus-coupled dock lifetime" suite for
  // the effect side of this same contract.
  it("marks its own dossier open as the one coupled to the camera, by reference", () => {
    selectCharacter("claude:1");
    expect(useBuildMode.getState().cameraCoupledCard).toBe(useBuildMode.getState().roomCard);
  });
});
