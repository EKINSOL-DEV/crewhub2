// RoomLinkDialog jsdom tests (M3 T5, project-based M5 T4). Real
// useCampusEdits store (same pattern as build-controls.smoke.test.tsx) with
// only its IPC persistence mocked, and the real useProjectsStore seeded
// directly via setState — proves the dialog's picks actually land on the
// placed building, not just that a callback fired.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Project } from "@/ipc/bindings";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

function project(over: Partial<Project> & { id: string; name: string; folder_path: string }): Project {
  return {
    description: null,
    icon: null,
    color: "#22c55e",
    docs_path: null,
    status: "active",
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

const PROJECTS: Project[] = [
  project({ id: "p1", name: "Engineering", folder_path: "/work/eng", color: "#22c55e", icon: "🛠️" }),
  project({ id: "p2", name: "Design", folder_path: "/work/design", color: "#f59e0b" }),
];

import { resetCampusEditsForTests, useCampusEdits } from "./store";
import { resetProjectsForTests, useProjectsStore } from "@/stores/projects";
import { RoomLinkDialog } from "./RoomLinkDialog";

describe("RoomLinkDialog", () => {
  let buildingId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    resetProjectsForTests();
    useProjectsStore.setState({ projects: PROJECTS, loaded: true });
    buildingId = useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 8, d: 6 }, null);
  });

  afterEach(cleanup);

  it("lists every project with a color dot, icon+name, and folder subtitle", () => {
    render(<RoomLinkDialog buildingId={buildingId} onClose={vi.fn()} />);
    expect(screen.getByTestId("room-link-project-p1")).toHaveTextContent("Engineering");
    expect(screen.getByTestId("room-link-project-p1")).toHaveTextContent("/work/eng");
    expect(screen.getByTestId("room-link-project-p2")).toHaveTextContent("Design");
  });

  it("picking a project writes its id onto the building and closes", () => {
    const onClose = vi.fn();
    render(<RoomLinkDialog buildingId={buildingId} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("room-link-project-p2"));
    expect(useCampusEdits.getState().edits.buildings[0]!.projectId).toBe("p2");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"No project" leaves projectId null and closes', () => {
    const onClose = vi.fn();
    render(<RoomLinkDialog buildingId={buildingId} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("room-link-none"));
    expect(useCampusEdits.getState().edits.buildings[0]!.projectId).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes without touching projectId", () => {
    const onClose = vi.fn();
    render(<RoomLinkDialog buildingId={buildingId} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useCampusEdits.getState().edits.buildings[0]!.projectId).toBeNull();
  });

  // Docked side panel (side-panel conversion): there's no backdrop left to
  // click — GamePanel gives this dialog a ✕ uniformly now (it previously had
  // none, relying on backdrop-click/Escape only).
  it("the ✕ button closes without touching projectId", () => {
    const onClose = vi.fn();
    render(<RoomLinkDialog buildingId={buildingId} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("game-panel-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useCampusEdits.getState().edits.buildings[0]!.projectId).toBeNull();
  });
});
