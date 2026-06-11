// Pure logic of the Lane D stores (M3 T7, EKI-85/EKI-87): suggestion fold,
// project stats join, room ordering + drag-free reorder.
import type { Task } from "@/ipc/bindings";
import { dirName, pathUnderRoot, projectStats, suggestProjects } from "@/stores/projects";
import { reorderRooms, roomsForProject, sortRooms } from "@/stores/rooms";
import { archived, project, room, sid } from "./fixtures";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    project_id: null,
    room_id: "r-1",
    title: overrides.id,
    description: null,
    status: "todo",
    priority: "medium",
    assignee_agent_id: null,
    created_by: "human",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("dirName", () => {
  test("takes the basename, tolerating trailing slashes", () => {
    expect(dirName("/work/proj")).toBe("proj");
    expect(dirName("/work/proj/")).toBe("proj");
    expect(dirName("/")).toBe("/");
  });
});

describe("suggestProjects (EKI-85 auto-suggest)", () => {
  const sessions = [
    archived({ id: sid("a"), project_path: "/work/alpha", last_modified_ms: 100 }),
    archived({ id: sid("b"), project_path: "/work/alpha", last_modified_ms: 300 }),
    archived({ id: sid("c"), project_path: "/work/beta", last_modified_ms: 200 }),
    archived({ id: sid("d"), project_path: "/work/registered", last_modified_ms: 400 }),
    archived({ id: sid("e"), project_path: "/work/registered/.worktrees/x", last_modified_ms: 500 }),
  ];
  const registered = [project({ id: "p-1", folder_path: "/work/registered" })];

  test("distinct paths minus registered roots (subpaths covered), newest first", () => {
    const got = suggestProjects(sessions, registered);
    expect(got.map((s) => s.folder_path)).toEqual(["/work/alpha", "/work/beta"]);
    expect(got[0]).toMatchObject({ name: "alpha", session_count: 2, last_modified_ms: 300 });
    expect(got[1]).toMatchObject({ name: "beta", session_count: 1 });
  });

  test("empty history suggests nothing", () => {
    expect(suggestProjects([], registered)).toEqual([]);
  });
});

describe("projectStats (EKI-85 card stats)", () => {
  const p = project({ id: "p-1", folder_path: "/work/proj" });

  test("counts archived sessions under the root (worktrees included) + last activity", () => {
    const stats = projectStats(
      p,
      [
        archived({ id: sid("a"), project_path: "/work/proj", last_modified_ms: 100 }),
        archived({ id: sid("b"), project_path: "/work/proj/.worktrees/x", last_modified_ms: 900 }),
        archived({ id: sid("c"), project_path: "/work/other", last_modified_ms: 999 }),
      ],
      [],
    );
    expect(stats.archived_sessions).toBe(2);
    expect(stats.last_activity_ms).toBe(900);
  });

  test("tasks grouped by status; open = everything not done", () => {
    const stats = projectStats(
      p,
      [],
      [
        task({ id: "t1", project_id: "p-1", status: "todo" }),
        task({ id: "t2", project_id: "p-1", status: "todo" }),
        task({ id: "t3", project_id: "p-1", status: "in_progress" }),
        task({ id: "t4", project_id: "p-1", status: "done" }),
        task({ id: "t5", project_id: "other", status: "todo" }),
      ],
    );
    expect(stats.tasks_by_status).toEqual({ todo: 2, in_progress: 1, done: 1 });
    expect(stats.open_tasks).toBe(3);
    expect(stats.last_activity_ms).toBeNull();
  });
});

describe("pathUnderRoot", () => {
  test("exact, nested, and non-matches", () => {
    expect(pathUnderRoot("/a/b", "/a/b")).toBe(true);
    expect(pathUnderRoot("/a/b/c", "/a/b/")).toBe(true);
    expect(pathUnderRoot("/a/bc", "/a/b")).toBe(false);
  });
});

describe("rooms ordering (EKI-87)", () => {
  const rooms = [
    room({ id: "r-c", name: "C", sort_order: 2, project_id: "p-1" }),
    room({ id: "r-a", name: "A", sort_order: 0, project_id: "p-1" }),
    room({ id: "r-b", name: "B", sort_order: 1, project_id: "p-1" }),
    room({ id: "r-hq", name: "HQ", sort_order: 0, project_id: null, is_hq: true }),
  ];

  test("sortRooms: sort_order asc, then created_at, then name", () => {
    expect(sortRooms(rooms.slice(0, 3)).map((r) => r.id)).toEqual(["r-a", "r-b", "r-c"]);
    const tied = [
      room({ id: "x", name: "Zed", sort_order: 0, created_at: 5 }),
      room({ id: "y", name: "Ann", sort_order: 0, created_at: 5 }),
      room({ id: "z", name: "Mid", sort_order: 0, created_at: 1 }),
    ];
    expect(sortRooms(tied).map((r) => r.id)).toEqual(["z", "y", "x"]);
  });

  test("roomsForProject splits project sections from HQ/shared", () => {
    expect(roomsForProject(rooms, "p-1").map((r) => r.id)).toEqual(["r-a", "r-b", "r-c"]);
    expect(roomsForProject(rooms, null).map((r) => r.id)).toEqual(["r-hq"]);
  });

  test("reorderRooms moves up/down with minimal sequential writes", () => {
    const siblings = roomsForProject(rooms, "p-1");
    // move B up: swap A/B → both get new sequential orders
    expect(reorderRooms(siblings, "r-b", -1)).toEqual([
      { id: "r-b", sort_order: 0 },
      { id: "r-a", sort_order: 1 },
    ]);
    // move A down one: same swap from the other side
    expect(reorderRooms(siblings, "r-a", 1)).toEqual([
      { id: "r-b", sort_order: 0 },
      { id: "r-a", sort_order: 1 },
    ]);
    // edges are no-ops
    expect(reorderRooms(siblings, "r-a", -1)).toEqual([]);
    expect(reorderRooms(siblings, "r-c", 1)).toEqual([]);
    // unknown id is a no-op
    expect(reorderRooms(siblings, "ghost", 1)).toEqual([]);
  });

  test("reorderRooms normalizes all-zero sort_orders into indices", () => {
    const flat = [
      room({ id: "x", name: "X", sort_order: 0, created_at: 1 }),
      room({ id: "y", name: "Y", sort_order: 0, created_at: 2 }),
      room({ id: "z", name: "Z", sort_order: 0, created_at: 3 }),
    ];
    expect(reorderRooms(flat, "z", -1)).toEqual([
      { id: "z", sort_order: 1 },
      { id: "y", sort_order: 2 },
    ]);
  });
});
