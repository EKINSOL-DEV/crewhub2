// RoomLinkDialog jsdom tests (M3 T5). Real useCampusEdits store (same
// pattern as build-controls.smoke.test.tsx) with only its IPC persistence
// mocked — proves the dialog's picks actually land on the placed building,
// not just that a callback fired.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Room } from "@/ipc/bindings";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

function room(over: Partial<Room> & { id: string; name: string }): Room {
  return {
    project_id: null,
    icon: null,
    color: "#22c55e",
    sort_order: 0,
    is_hq: false,
    style_json: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

const ROOMS: Room[] = [
  room({ id: "r1", name: "Engineering", color: "#22c55e" }),
  room({ id: "r2", name: "Design", color: "#f59e0b" }),
];

vi.mock("@/stores/bindings", () => ({
  useBindingsStore: Object.assign(
    (selector: (s: { rooms: Room[] }) => unknown) => selector({ rooms: ROOMS }),
    { getState: () => ({ rooms: ROOMS }) },
  ),
}));

import { resetCampusEditsForTests, useCampusEdits } from "./store";
import { RoomLinkDialog } from "./RoomLinkDialog";

describe("RoomLinkDialog", () => {
  let buildingId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    buildingId = useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 8, d: 6 }, null);
  });

  afterEach(cleanup);

  it("lists every room with a color dot + name", () => {
    render(<RoomLinkDialog buildingId={buildingId} onClose={vi.fn()} />);
    expect(screen.getByTestId("room-link-room-r1")).toHaveTextContent("Engineering");
    expect(screen.getByTestId("room-link-room-r2")).toHaveTextContent("Design");
  });

  it("picking a room writes its id onto the building and closes", () => {
    const onClose = vi.fn();
    render(<RoomLinkDialog buildingId={buildingId} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("room-link-room-r2"));
    expect(useCampusEdits.getState().edits.buildings[0]!.roomId).toBe("r2");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"No room" leaves roomId null and closes', () => {
    const onClose = vi.fn();
    render(<RoomLinkDialog buildingId={buildingId} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("room-link-none"));
    expect(useCampusEdits.getState().edits.buildings[0]!.roomId).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes without touching roomId", () => {
    const onClose = vi.fn();
    render(<RoomLinkDialog buildingId={buildingId} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useCampusEdits.getState().edits.buildings[0]!.roomId).toBeNull();
  });

  it("clicking the backdrop closes without touching roomId", () => {
    const onClose = vi.fn();
    render(<RoomLinkDialog buildingId={buildingId} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("room-link-dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useCampusEdits.getState().edits.buildings[0]!.roomId).toBeNull();
  });
});
