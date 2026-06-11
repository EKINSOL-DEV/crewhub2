// Kanban board panel (T10/T11, EKI-93): five columns folded live from the
// tasks store — human edits and agent MCP edits are indistinguishable to this
// rendering layer (D-M3-2), distinguishable in the drawer's timeline (D-M3-4).
// Filters: project from the tab's useProjectFilter(), room/assignee/priority
// local (persisted in panel params), HQ = explicit cross-project view.
import "./board.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { PanelProps } from "@/app/panel-registry";
import { useProjectFilter } from "@/app/project-filter";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/components/use-reduced-motion";
import type { Task } from "@/ipc/bindings";
import { ConfettiBurst } from "@/panels/crew/ConfettiBurst";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useSessionsStore } from "@/stores/sessions";
import { groupByStatus, taskMatchesFilter, useTasksStore, type BoardFilter } from "@/stores/tasks";
import { Column } from "./Column";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { RunWithAgentDialog } from "./RunWithAgentDialog";
import { SortableTaskCard, TaskCard } from "./TaskCard";
import { TaskDrawer } from "./TaskDrawer";
import {
  PRIORITY_CONFIG,
  TASK_PRIORITIES,
  TASK_STATUSES,
  isTaskStatus,
  type TaskStatus,
} from "./task-constants";

export default function BoardPanel({ params, setParams }: PanelProps) {
  const { projectId, project, projects } = useProjectFilter();
  const tasksById = useTasksStore((s) => s.byId);
  const links = useTasksStore((s) => s.links);
  const loaded = useTasksStore((s) => s.loaded);
  const agents = useAgentsStore((s) => s.agents);
  const rooms = useBindingsStore((s) => s.rooms);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runTaskId, setRunTaskId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const reduced = usePrefersReducedMotion();
  // A finished drag fires a click on the dropped card — swallow it (T11).
  const dragEndedAt = useRef(0);

  // Pointer activation distance 8 px so card clicks (open drawer) and drags
  // never fight (D-M3-1); keyboard lifts on Space only — Enter opens cards.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  useEffect(() => {
    void useTasksStore.getState().init();
    void useAgentsStore.getState().init();
    void useBindingsStore.getState().init();
    void useSessionsStore.getState().init();
  }, []);

  const hq = params.hq === "1";
  const filter: BoardFilter = useMemo(
    () => ({
      projectId,
      hq,
      roomId: params.room || null,
      assigneeId: params.assignee || null,
      priority: params.priority || null,
    }),
    [projectId, hq, params.room, params.assignee, params.priority],
  );

  const setParam = (key: string, value: string | null) => {
    const next = { ...params };
    if (value) next[key] = value;
    else delete next[key];
    setParams(next);
  };

  // T17: the palette's "New task" opens the board with `create=1` — the param
  // shows the create dialog; closing it clears both the param and local state.
  const showCreate = creating || params.create === "1";
  const closeCreate = () => {
    setCreating(false);
    if (params.create) setParam("create", null);
  };

  const filtered = useMemo(
    () => [...tasksById.values()].filter((t) => taskMatchesFilter(t, filter)),
    [tasksById, filter],
  );
  const groups = useMemo(() => groupByStatus(filtered), [filtered]);
  const boardEmpty = loaded && filtered.length === 0;

  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Rooms offered in filters/create: scoped to the project unless HQ/all.
  const scopedRooms = useMemo(
    () =>
      !hq && projectId ? rooms.filter((r) => r.project_id === projectId || r.project_id === null) : rooms,
    [rooms, hq, projectId],
  );

  const move = (taskId: string, status: TaskStatus) => {
    const before = useTasksStore.getState().byId.get(taskId)?.status;
    if (status === "done" && before !== "done") setCelebrate(true); // Confetti Done (D-M3-8)
    void useTasksStore
      .getState()
      .move(taskId, status)
      .then((err) => {
        if (err) setError(`😬 couldn't move that — put it back (${err})`);
      });
  };

  const openDrawer = (taskId: string) => {
    if (Date.now() - dragEndedAt.current < 250) return; // that "click" was a drop
    setParam("task", taskId);
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveTask(tasksById.get(String(e.active.id)) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    dragEndedAt.current = Date.now();
    if (!e.over) return;
    const overId = String(e.over.id);
    const resolveStatus = (): TaskStatus | null => {
      if (overId.startsWith("column:")) {
        const s = overId.slice("column:".length);
        return isTaskStatus(s) ? s : null;
      }
      // Dropped onto another card: adopt that card's column.
      const t = tasksById.get(overId);
      return t && isTaskStatus(t.status) ? t.status : null;
    };
    const status = resolveStatus();
    const taskId = String(e.active.id);
    const current = tasksById.get(taskId);
    if (status && current && current.status !== status) move(taskId, status);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="board-panel">
      <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-xs">
        <button
          type="button"
          data-testid="hq-toggle"
          aria-pressed={hq}
          title="HQ view: every project on one board"
          className={`rounded-full border px-2 py-0.5 ${hq ? "border-ring bg-muted font-medium" : "text-muted-foreground"}`}
          onClick={() => setParam("hq", hq ? null : "1")}
        >
          {hq ? "🌐 all projects" : project ? `${project.icon ?? "📁"} ${project.name}` : "🌐 all projects"}
        </button>
        <label className="flex items-center gap-1">
          room
          <select
            aria-label="Room filter"
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={params.room ?? ""}
            onChange={(e) => setParam("room", e.target.value || null)}
          >
            <option value="">all</option>
            {scopedRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.icon ?? "🚪"} {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          assignee
          <select
            aria-label="Assignee filter"
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={params.assignee ?? ""}
            onChange={(e) => setParam("assignee", e.target.value || null)}
          >
            <option value="">anyone</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon ?? "🤖"} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          priority
          <select
            aria-label="Priority filter"
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={params.priority ?? ""}
            onChange={(e) => setParam("priority", e.target.value || null)}
          >
            <option value="">any</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_CONFIG[p].emoji} {p}
              </option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        <Button size="xs" data-testid="new-task" onClick={() => setCreating(true)}>
          📝 New task
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 border-b bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-2">
            {TASK_STATUSES.map((status) => (
              <Column key={status} status={status} count={groups[status].length} boardEmpty={boardEmpty}>
                <SortableContext
                  items={groups[status].map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {groups[status].map((t) => (
                    <SortableTaskCard
                      key={t.id}
                      task={t}
                      room={t.room_id ? (roomById.get(t.room_id) ?? null) : null}
                      assignee={t.assignee_agent_id ? (agentById.get(t.assignee_agent_id) ?? null) : null}
                      project={hq && t.project_id ? (projectById.get(t.project_id) ?? null) : null}
                      link={links[t.id] ?? null}
                      onOpen={openDrawer}
                      onMove={move}
                      onRun={setRunTaskId}
                    />
                  ))}
                </SortableContext>
              </Column>
            ))}
          </div>
          <DragOverlay dropAnimation={reduced ? null : undefined}>
            {activeTask && (
              <div className="ch-drag-tilt w-48" data-testid="drag-overlay-card">
                <TaskCard
                  task={activeTask}
                  room={activeTask.room_id ? (roomById.get(activeTask.room_id) ?? null) : null}
                  assignee={
                    activeTask.assignee_agent_id
                      ? (agentById.get(activeTask.assignee_agent_id) ?? null)
                      : null
                  }
                  project={
                    hq && activeTask.project_id ? (projectById.get(activeTask.project_id) ?? null) : null
                  }
                  link={links[activeTask.id] ?? null}
                  onOpen={() => {}}
                  onMove={() => {}}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
        {celebrate && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
            <ConfettiBurst onDone={() => setCelebrate(false)} />
          </div>
        )}
        {params.task && (
          <TaskDrawer
            taskId={params.task}
            rooms={scopedRooms}
            onClose={() => setParam("task", null)}
            onRunWithAgent={(t) => setRunTaskId(t.id)}
            onError={(msg) => setError(msg)}
          />
        )}
        {runTaskId &&
          (() => {
            const t = tasksById.get(runTaskId);
            return t ? (
              <RunWithAgentDialog
                task={t}
                room={t.room_id ? (roomById.get(t.room_id) ?? null) : null}
                onClose={() => setRunTaskId(null)}
                onError={(msg) => setError(msg)}
              />
            ) : null;
          })()}
        {showCreate && (
          <CreateTaskDialog
            rooms={scopedRooms}
            agents={agents}
            defaultRoomId={params.room || null}
            projectId={hq ? null : projectId}
            onClose={closeCreate}
          />
        )}
      </div>
    </div>
  );
}
