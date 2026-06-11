// Board drag-and-drop tests (T11, EKI-93/D-M3-1): keyboard DnD (lift with
// Space, arrow across columns, drop), the 8 px pointer activation constraint
// regression (clicks open the drawer, never drag), Confetti Done and its
// reduced-motion variant. jsdom has no layout, so column/card rects are
// mocked to a fixed grid.
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { useState } from "react";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import BoardPanel from "@/panels/board/BoardPanel";
import { resetProjectsForTests } from "@/app/project-filter";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { useTasksStore } from "@/stores/tasks";
import { TASK_STATUSES } from "@/panels/board/task-constants";
import { task } from "./fixtures";

function Host({ initial = {} }: { initial?: Record<string, string> }) {
  const [params, setParams] = useState<Record<string, string>>(initial);
  return <BoardPanel leafId="leaf-1" params={params} setParams={setParams} />;
}

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
}

// ── Fixed-grid layout mock: columns side by side, cards inside ──────────────

const COLUMN_X: Record<string, number> = Object.fromEntries(TASK_STATUSES.map((s, i) => [s, i * 300]));

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect;
}

const realGetRect = HTMLElement.prototype.getBoundingClientRect;

function mockBoardLayout() {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const column = this.getAttribute("data-dnd-column");
    if (column !== null) return rect(COLUMN_X[column] ?? 0, 0, 250, 600);
    const testid = this.getAttribute("data-testid") ?? "";
    if (testid.startsWith("task-card-")) {
      const host = this.closest("[data-dnd-column]");
      const col = host?.getAttribute("data-dnd-column") ?? "todo";
      const index = host ? Array.from(host.querySelectorAll("[data-testid^='task-card-']")).indexOf(this) : 0;
      return rect((COLUMN_X[col] ?? 0) + 10, 10 + Math.max(index, 0) * 80, 230, 70);
    }
    // dnd-kit measures its own DragOverlay wrapper node (our card's parent).
    if (
      testid === "drag-overlay-card" ||
      this.firstElementChild?.getAttribute("data-testid") === "drag-overlay-card"
    ) {
      return rect(10, 10, 230, 70);
    }
    return rect(0, 0, 0, 0);
  };
}

function mockBoardIPC(extra: Record<string, (args: unknown) => unknown> = {}) {
  mockIPC((cmd, args) => {
    if (cmd in extra) return extra[cmd]!(args);
    if (cmd === "list_tasks") return [];
    return [];
  });
}

beforeEach(() => {
  mockMatchMedia(false);
  mockBoardLayout();
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = realGetRect;
  cleanup();
  clearMocks();
  useTasksStore.getState().reset();
  useAgentsStore.getState().reset();
  useBindingsStore.getState().reset();
  useSessionsStore.getState().reset();
  resetProjectsForTests();
});

test("keyboard DnD: Space lifts (overlay + tilt), ArrowRight crosses a column, Space drops", async () => {
  const updates: Array<{ id: string; status: string }> = [];
  mockBoardIPC({
    list_tasks: () => [task({ id: "t1", title: "Fix it", status: "todo" })],
    update_task: (args) => {
      const t = (args as { task: ReturnType<typeof task> }).task;
      updates.push({ id: t.id, status: t.status });
      return t;
    },
  });
  render(<Host />);
  const card = await screen.findByTestId("task-card-t1");
  card.focus();
  fireEvent.keyDown(card, { code: "Space", key: " " });
  await screen.findByTestId("drag-overlay-card"); // Drag Tilt overlay is up
  expect(screen.getByTestId("drag-overlay-card")).toHaveClass("ch-drag-tilt");
  // KeyboardSensor attaches its document keydown listener in a setTimeout(0).
  await new Promise((r) => setTimeout(r, 50));

  fireEvent.keyDown(document, { code: "ArrowRight", key: "ArrowRight" });
  await new Promise((r) => setTimeout(r, 50));
  fireEvent.keyDown(document, { code: "Space", key: " " });

  await waitFor(() => expect(updates).toEqual([{ id: "t1", status: "in_progress" }]));
  const inProgress = screen.getByTestId("board-column-in_progress");
  expect(within(inProgress).getByText("Fix it")).toBeInTheDocument();
});

test("activation constraint regression: a plain click opens the drawer, never a drag", async () => {
  const updates: string[] = [];
  mockBoardIPC({
    list_tasks: () => [task({ id: "t1", title: "Fix it", status: "todo" })],
    update_task: () => {
      updates.push("update");
      return null;
    },
    list_task_events: () => [],
  });
  render(<Host />);
  const card = await screen.findByTestId("task-card-t1");
  // pointer down + up without crossing the 8 px constraint = a click
  fireEvent.pointerDown(card, { clientX: 20, clientY: 20, button: 0, isPrimary: true });
  fireEvent.pointerUp(card, { clientX: 22, clientY: 21, button: 0, isPrimary: true });
  fireEvent.click(card);
  await screen.findByTestId("task-drawer");
  expect(updates).toEqual([]);
  expect(screen.queryByTestId("drag-overlay-card")).toBeNull();
});

test("Confetti Done fires when a card moves into done (quick-move path included)", async () => {
  mockBoardIPC({
    list_tasks: () => [task({ id: "t1", title: "Fix it", status: "review" })],
    update_task: (args) => (args as { task: ReturnType<typeof task> }).task,
  });
  render(<Host />);
  await screen.findByText("Fix it");
  fireEvent.click(screen.getByTestId("quick-move-t1"));
  fireEvent.click(screen.getByRole("menuitem", { name: /mark as done/i }));
  await screen.findByTestId("confetti");
});

test("Confetti Done respects prefers-reduced-motion (renders nothing)", async () => {
  mockMatchMedia(true);
  mockBoardIPC({
    list_tasks: () => [task({ id: "t1", title: "Fix it", status: "review" })],
    update_task: (args) => (args as { task: ReturnType<typeof task> }).task,
  });
  render(<Host />);
  await screen.findByText("Fix it");
  fireEvent.click(screen.getByTestId("quick-move-t1"));
  fireEvent.click(screen.getByRole("menuitem", { name: /mark as done/i }));
  const done = screen.getByTestId("board-column-done");
  await within(done).findByText("Fix it");
  expect(screen.queryByTestId("confetti")).toBeNull();
});
