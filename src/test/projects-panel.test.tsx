// Projects panel (M3 T7, EKI-85): register via the native picker only,
// friendly path errors, auto-suggest from session history, card stats, and
// the shared store keeping the shell's project switcher live.
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { resetProjectsForTests, useProjects } from "@/app/project-filter";
import type { Project } from "@/ipc/bindings";
import { ProjectsPanel } from "@/panels/projects/ProjectsPanel";
import { taskSummary } from "@/panels/projects/ProjectCard";
import { resetRoomsForTests } from "@/stores/rooms";
import { resetWorkspaceForTests, useWorkspace } from "@/stores/workspace";
import { archived, project, seedWorkspace, sid } from "./fixtures";

beforeEach(seedWorkspace);
afterEach(() => {
  cleanup();
  clearMocks();
  resetProjectsForTests();
  resetRoomsForTests();
  resetWorkspaceForTests();
});

/** Stateful project IPC: a tiny in-memory backend for the CRUD round-trip. */
function mockProjectBackend(opts?: { seed?: Project[]; pick?: string | null; failCreate?: string }) {
  const projects: Project[] = [...(opts?.seed ?? [])];
  const calls: Array<{ cmd: string; args: unknown }> = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args });
    switch (cmd) {
      case "list_projects":
        return [...projects];
      case "pick_folder":
        return opts?.pick ?? null;
      case "create_project": {
        if (opts?.failCreate) throw opts.failCreate;
        const input = (args as { input: Omit<Project, "id"> }).input;
        const created = project({ ...input, id: `p-${projects.length + 1}` });
        projects.push(created);
        return created;
      }
      case "update_project": {
        const next = (args as { project: Project }).project;
        const idx = projects.findIndex((p) => p.id === next.id);
        if (idx >= 0) projects[idx] = next;
        return next;
      }
      case "delete_project": {
        const idx = projects.findIndex((p) => p.id === (args as { id: string }).id);
        if (idx >= 0) projects.splice(idx, 1);
        return idx >= 0;
      }
      case "list_archived_sessions":
        return [
          archived({ id: sid("s1"), project_path: "/work/seen", last_modified_ms: 100 }),
          archived({ id: sid("s2"), project_path: "/work/seen", last_modified_ms: 200 }),
        ];
      case "list_tasks":
        return [];
      default:
        return null;
    }
  });
  return { projects, calls };
}

test("empty state: register your first project (D-M3-8 Quiet copy)", async () => {
  mockIPC((cmd) =>
    cmd === "list_archived_sessions" || cmd === "list_projects" || cmd === "list_tasks" ? [] : null,
  );
  render(<ProjectsPanel />);
  await screen.findByText("Register your first project");
});

test("register via the folder picker: pick fills path + default name, save creates (EKI-85)", async () => {
  const { calls } = mockProjectBackend({ pick: "/work/new-proj" });
  render(<ProjectsPanel />);
  fireEvent.click(await screen.findByTestId("register-first"));
  fireEvent.click(screen.getByText("Pick folder…"));
  await waitFor(() => expect(screen.getByTestId("picked-folder").textContent).toBe("/work/new-proj"));
  expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("new-proj");

  fireEvent.click(screen.getByText("Register 🗺️"));
  await waitFor(() => expect(calls.some((c) => c.cmd === "create_project")).toBe(true));
  const input = (calls.find((c) => c.cmd === "create_project")?.args as { input: { folder_path: string } })
    .input;
  expect(input.folder_path).toBe("/work/new-proj");
  // the card appears from the refreshed shared store…
  await screen.findByText("new-proj");
  // …which is the SAME store the shell's project switcher reads (live AC)
  expect(useProjects.getState().projects.map((p) => p.folder_path)).toContain("/work/new-proj");
});

test("path-policy rejection renders a friendly error, not an error wall", async () => {
  mockProjectBackend({ pick: "/etc/forbidden", failCreate: "path not allowed by policy" });
  render(<ProjectsPanel />);
  fireEvent.click(await screen.findByTestId("register-first"));
  fireEvent.click(screen.getByText("Pick folder…"));
  await waitFor(() => expect(screen.getByTestId("picked-folder").textContent).toBe("/etc/forbidden"));
  fireEvent.click(screen.getByText("Register 🗺️"));
  const err = await screen.findByTestId("project-form-error");
  expect(err.textContent).toMatch(/That folder didn't work out/);
  expect(err.textContent).toMatch(/path not allowed by policy/);
});

test("auto-suggest lists unregistered history paths; one-click register uses dir name", async () => {
  const { calls } = mockProjectBackend();
  render(<ProjectsPanel />);
  await screen.findByText("/work/seen");
  expect(screen.getByText("2 sessions")).toBeInTheDocument();

  fireEvent.click(screen.getByTestId("suggest-register-seen"));
  await waitFor(() => expect(calls.some((c) => c.cmd === "create_project")).toBe(true));
  const input = (
    calls.find((c) => c.cmd === "create_project")?.args as {
      input: { name: string; folder_path: string };
    }
  ).input;
  expect(input).toMatchObject({ name: "seen", folder_path: "/work/seen" });
  // registered → suggestion disappears
  await waitFor(() => expect(screen.queryByTestId("project-suggestions")).toBeNull());
});

test("cards show session + task stats and archive stays visible behind the toggle", async () => {
  const seeded = [
    project({ id: "p-1", name: "Seen", folder_path: "/work/seen" }),
    project({ id: "p-2", name: "Dusty", folder_path: "/work/dusty", status: "archived" }),
  ];
  mockIPC((cmd) => {
    switch (cmd) {
      case "list_projects":
        return seeded;
      case "list_archived_sessions":
        return [
          archived({ id: sid("s1"), project_path: "/work/seen", last_modified_ms: Date.now() }),
          archived({ id: sid("s2"), project_path: "/work/seen/wt", last_modified_ms: Date.now() }),
        ];
      case "list_tasks":
        return [
          {
            id: "t1",
            project_id: "p-1",
            room_id: "r",
            title: "t",
            description: null,
            status: "todo",
            priority: "medium",
            assignee_agent_id: null,
            created_by: "human",
            created_at: 0,
            updated_at: 0,
          },
        ];
      default:
        return null;
    }
  });
  render(<ProjectsPanel />);
  const card = await screen.findByTestId("project-card-p-1");
  await waitFor(() =>
    expect(card.querySelector("[data-testid=project-stats]")?.textContent).toMatch(
      /2 sessions · last just now · 1 todo/,
    ),
  );
  // archived project hidden by default, shown via the toggle
  expect(screen.queryByTestId("project-card-p-2")).toBeNull();
  fireEvent.click(screen.getByLabelText(/show archived/));
  await screen.findByTestId("project-card-p-2");
});

test("taskSummary formats only occurring statuses in board order", () => {
  expect(taskSummary({ done: 2, todo: 1, in_progress: 3 })).toBe("1 todo · 3 in progress · 2 done");
  expect(taskSummary({})).toBe("");
});

test("delete asks first and explains what goes with it", async () => {
  const { calls } = mockProjectBackend({
    seed: [project({ id: "p-1", name: "Doomed", folder_path: "/work/doomed" })],
  });
  render(<ProjectsPanel />);
  await screen.findByTestId("project-card-p-1");
  fireEvent.click(screen.getByText("Delete"));
  await screen.findByTestId("confirm-delete");
  fireEvent.click(screen.getByText("Delete it"));
  await waitFor(() => expect(calls.some((c) => c.cmd === "delete_project")).toBe(true));
  await waitFor(() => expect(screen.queryByTestId("project-card-p-1")).toBeNull());
});

test("workspace project filter can be set from a card (Focus)", async () => {
  mockProjectBackend({ seed: [project({ id: "p-1", name: "Seen", folder_path: "/work/seen" })] });
  render(<ProjectsPanel />);
  await screen.findByTestId("project-card-p-1");
  fireEvent.click(screen.getByText("Focus"));
  expect(useWorkspace.getState().tabs[0]?.projectFilter).toBe("p-1");
});
