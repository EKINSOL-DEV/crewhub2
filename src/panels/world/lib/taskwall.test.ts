// Task wall fold (EKI-75): pure summaries the 3D wall renders from — same
// tasks store the kanban board folds, scoped per room (HQ = cross-project).
import { describe, expect, it } from "vitest";
import type { Task } from "@/ipc/bindings";
import { TASK_STATUSES } from "@/panels/board/task-constants";
import { WALL_TITLE_LIMIT, columnSlots, summarizeWall, truncateTitle, wallScopeFor } from "./taskwall";

let seq = 0;

function task(over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    project_id: "p1",
    room_id: "r1",
    title: `Task ${seq}`,
    description: null,
    status: "todo",
    priority: "medium",
    assignee_agent_id: null,
    created_by: "human",
    created_at: seq,
    updated_at: seq,
    ...over,
  };
}

describe("summarizeWall", () => {
  it("returns all five columns in board order, even when empty", () => {
    const wall = summarizeWall([], { kind: "room", roomId: "r1" });
    expect(wall.columns.map((c) => c.status)).toEqual([...TASK_STATUSES]);
    expect(wall.columns.every((c) => c.count === 0 && c.titles.length === 0)).toBe(true);
    expect(wall.total).toBe(0);
  });

  it("scopes a room wall to that room only", () => {
    const tasks = [
      task({ room_id: "r1", status: "todo" }),
      task({ room_id: "r1", status: "in_progress" }),
      task({ room_id: "r2", status: "todo" }),
      task({ room_id: null, status: "todo" }),
    ];
    const wall = summarizeWall(tasks, { kind: "room", roomId: "r1" });
    expect(wall.total).toBe(2);
    expect(wall.columns.find((c) => c.status === "todo")?.count).toBe(1);
    expect(wall.columns.find((c) => c.status === "in_progress")?.count).toBe(1);
  });

  it("HQ wall totals across every project and room", () => {
    const tasks = [
      task({ project_id: "p1", room_id: "r1", status: "done" }),
      task({ project_id: "p2", room_id: "r2", status: "done" }),
      task({ project_id: null, room_id: null, status: "blocked" }),
    ];
    const wall = summarizeWall(tasks, { kind: "hq" });
    expect(wall.total).toBe(3);
    expect(wall.columns.find((c) => c.status === "done")?.count).toBe(2);
    expect(wall.columns.find((c) => c.status === "blocked")?.count).toBe(1);
  });

  it("orders titles urgent-first then freshest and caps them at the limit", () => {
    const tasks = [
      task({ title: "old medium", priority: "medium", updated_at: 1 }),
      task({ title: "fresh medium", priority: "medium", updated_at: 9 }),
      task({ title: "urgent", priority: "urgent", updated_at: 2 }),
      task({ title: "low", priority: "low", updated_at: 8 }),
      task({ title: "high", priority: "high", updated_at: 3 }),
    ];
    const wall = summarizeWall(tasks, { kind: "room", roomId: "r1" });
    const todo = wall.columns.find((c) => c.status === "todo")!;
    expect(todo.count).toBe(5);
    expect(todo.titles).toHaveLength(WALL_TITLE_LIMIT);
    expect(todo.titles).toEqual(["urgent", "high", "fresh medium"]);
  });

  it("ignores tasks with unknown statuses instead of crashing", () => {
    const wall = summarizeWall([task({ status: "limbo" })], { kind: "room", roomId: "r1" });
    expect(wall.total).toBe(0);
  });

  it("gives every column a stable color and label", () => {
    const wall = summarizeWall([], { kind: "hq" });
    for (const c of wall.columns) {
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});

describe("wallScopeFor", () => {
  it("maps an HQ zone to the cross-project scope and rooms to themselves", () => {
    expect(wallScopeFor({ id: "r1", isHq: false })).toEqual({ kind: "room", roomId: "r1" });
    expect(wallScopeFor({ id: "hq", isHq: true })).toEqual({ kind: "hq" });
  });
});

describe("columnSlots", () => {
  it("splits the wall width into n centered slots with gaps", () => {
    const slots = columnSlots(10, 5, 0.2);
    expect(slots).toHaveLength(5);
    // Centered: symmetric about 0.
    expect(slots[0]!.x).toBeCloseTo(-slots[4]!.x);
    expect(slots[2]!.x).toBeCloseTo(0);
    // Uniform width, gaps respected: 5w + 4g = total.
    const w = slots[0]!.w;
    expect(slots.every((s) => Math.abs(s.w - w) < 1e-9)).toBe(true);
    expect(5 * w + 4 * 0.2).toBeCloseTo(10);
    // Monotonic left → right.
    for (let i = 1; i < slots.length; i++) expect(slots[i]!.x).toBeGreaterThan(slots[i - 1]!.x);
  });

  it("handles a single slot", () => {
    expect(columnSlots(4, 1, 0.5)).toEqual([{ x: 0, w: 4 }]);
  });
});

describe("truncateTitle", () => {
  it("passes short titles through and ellipsizes long ones", () => {
    expect(truncateTitle("ship it", 16)).toBe("ship it");
    expect(truncateTitle("a very long task title indeed", 16)).toBe("a very long tas…");
    expect(truncateTitle("a very long task title indeed", 16)).toHaveLength(16);
  });
});
