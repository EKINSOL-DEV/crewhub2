// ProjectsDialog jsdom tests (M6 T4). Real useProjectsStore (only the
// commands.*Project IPC calls mocked, same pattern as room-link.test.tsx /
// build-controls.smoke.test.tsx) so create/edit/delete actually land on the
// store, not just that a callback fired.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Project } from "@/ipc/bindings";

const { createProject, updateProject, deleteProject } = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("@/ipc/bindings", () => ({
  commands: {
    listProjects: vi.fn(async () => ({ status: "ok", data: [] })),
    createProject,
    updateProject,
    deleteProject,
  },
}));

vi.mock("@/game/audio/sfx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/game/audio/sfx")>();
  return { ...actual, playSfx: vi.fn() };
});

import { playSfx } from "@/game/audio/sfx";
import { resetProjectsForTests, useProjectsStore } from "@/stores/projects";
import { ProjectsDialog } from "./ProjectsDialog";

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

const ENGINEERING = project({ id: "p1", name: "Engineering", folder_path: "/work/eng", icon: "🛠️" });
const DESIGN = project({ id: "p2", name: "Design", folder_path: "/work/design", color: "#f59e0b" });

describe("ProjectsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProjectsForTests();
    useProjectsStore.setState({ projects: [ENGINEERING, DESIGN], loaded: true });
  });

  afterEach(cleanup);

  it("lists every project with a color dot, icon+name, folder subtitle, and status", () => {
    render(<ProjectsDialog onClose={vi.fn()} />);
    const row = screen.getByTestId("projects-dialog-project-p1");
    expect(row).toHaveTextContent("Engineering");
    expect(row).toHaveTextContent("/work/eng");
    expect(row).toHaveTextContent("active");
  });

  it("➕ opens the create form; saving with a name and folder creates a project and returns to the list", async () => {
    createProject.mockResolvedValue({
      status: "ok",
      data: project({ id: "p3", name: "New", folder_path: "/w/n" }),
    });
    render(<ProjectsDialog onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId("projects-dialog-create"));
    expect(screen.getByTestId("projects-dialog-form")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("projects-dialog-form-name"), { target: { value: "New project" } });
    fireEvent.change(screen.getByTestId("projects-dialog-form-folder"), { target: { value: "/work/new" } });
    fireEvent.click(screen.getByTestId("projects-dialog-form-save"));

    await screen.findByTestId("projects-dialog-list");
    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New project", folder_path: "/work/new" }),
    );
    expect(playSfx).toHaveBeenCalledWith("place");
  });

  it("the save button stays disabled until both name and folder are filled in", () => {
    render(<ProjectsDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("projects-dialog-create"));
    expect(screen.getByTestId("projects-dialog-form-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("projects-dialog-form-name"), { target: { value: "Only a name" } });
    expect(screen.getByTestId("projects-dialog-form-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("projects-dialog-form-folder"), { target: { value: "/w" } });
    expect(screen.getByTestId("projects-dialog-form-save")).not.toBeDisabled();
  });

  it("surfaces a create error inline and stays on the form", async () => {
    createProject.mockResolvedValue({ status: "error", error: "that folder is taken" });
    render(<ProjectsDialog onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId("projects-dialog-create"));
    fireEvent.change(screen.getByTestId("projects-dialog-form-name"), { target: { value: "New" } });
    fireEvent.change(screen.getByTestId("projects-dialog-form-folder"), { target: { value: "/work/new" } });
    fireEvent.click(screen.getByTestId("projects-dialog-form-save"));

    expect(await screen.findByTestId("projects-dialog-error")).toHaveTextContent("that folder is taken");
    expect(screen.getByTestId("projects-dialog-form")).toBeInTheDocument();
  });

  it("✏️ opens an edit form pre-filled with the project's current fields; saving updates it", async () => {
    updateProject.mockResolvedValue({ status: "ok", data: { ...ENGINEERING, name: "Eng Renamed" } });
    render(<ProjectsDialog onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId("projects-dialog-edit-p1"));
    const nameInput = screen.getByTestId("projects-dialog-form-name") as HTMLInputElement;
    expect(nameInput.value).toBe("Engineering");

    fireEvent.change(nameInput, { target: { value: "Eng Renamed" } });
    fireEvent.click(screen.getByTestId("projects-dialog-form-color-#f43f5e"));
    fireEvent.click(screen.getByTestId("projects-dialog-form-save"));

    await screen.findByTestId("projects-dialog-list");
    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Eng Renamed", color: "#f43f5e" }),
    );
    expect(playSfx).toHaveBeenCalledWith("click");
  });

  it("🗑 requires a confirm step before deleting", async () => {
    deleteProject.mockResolvedValue({ status: "ok", data: true });
    render(<ProjectsDialog onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId("projects-dialog-delete-p1"));
    expect(screen.getByTestId("projects-dialog-confirm-delete")).toHaveTextContent("Engineering");
    expect(deleteProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("projects-dialog-confirm-delete-yes"));
    await vi.waitFor(() => expect(deleteProject).toHaveBeenCalledWith("p1"));
  });

  it('"Keep it" cancels the delete without calling the command', () => {
    render(<ProjectsDialog onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("projects-dialog-delete-p1"));
    fireEvent.click(screen.getByTestId("projects-dialog-confirm-delete-no"));
    expect(screen.queryByTestId("projects-dialog-confirm-delete")).toBeNull();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("surfaces a delete error inline", async () => {
    deleteProject.mockResolvedValue({ status: "error", error: "still has open tasks" });
    render(<ProjectsDialog onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId("projects-dialog-delete-p1"));
    fireEvent.click(screen.getByTestId("projects-dialog-confirm-delete-yes"));

    expect(await screen.findByTestId("projects-dialog-error")).toHaveTextContent("still has open tasks");
  });

  it("Escape closes", () => {
    const onClose = vi.fn();
    render(<ProjectsDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Docked side panel (side-panel conversion): there's no backdrop left to
  // click — closing is ✕ (GamePanel's own contract, see game-panel.test.tsx)
  // or Escape (above).
  it("the ✕ button closes", () => {
    const onClose = vi.fn();
    render(<ProjectsDialog onClose={onClose} />);
    fireEvent.click(screen.getByTestId("game-panel-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
