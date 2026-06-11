// Board card (T10/T11, EKI-93): title, priority chip, assignee avatar, room
// chip (+ project chip in HQ view), quick-move menu (⋯ — the always-available
// non-drag path, D-M3-1) and the Board Critter when a run is linked (D-M3-8).
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { StatusEmoji } from "@/components/StatusEmoji";
import type { Agent, Project, Room, Task } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/stores/sessions";
import { sessionKey } from "@/stores/sessions";
import type { TaskRunLink } from "@/stores/tasks";
import { quickMoveMenu } from "./quick-move";
import { isTaskStatus, PRIORITY_CONFIG, type TaskPriority, type TaskStatus } from "./task-constants";

export interface TaskCardProps {
  task: Task;
  room: Room | null;
  assignee: Agent | null;
  /** Set in HQ cross-project view: adds the project color chip. */
  project: Project | null;
  link: TaskRunLink | null;
  onOpen: (taskId: string) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  /** dnd-kit seam (T11): the sortable wrapper passes ref/style/listeners in. */
  innerRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
  dragProps?: Record<string, unknown>;
  /** The original card while its clone rides the DragOverlay. */
  dragging?: boolean;
}

function QuickMoveMenu({ task, onMove }: { task: Task; onMove: TaskCardProps["onMove"] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (!isTaskStatus(task.status)) return null;
  const options = quickMoveMenu(task.status);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={`Move task ${task.title}`}
        data-testid={`quick-move-${task.id}`}
        className="rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          data-testid="quick-move-menu"
          className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-card py-1 shadow-lg"
        >
          {options.map((o, i) => (
            <div key={o.status}>
              {i > 0 && options[i - 1]!.quick && !o.quick && <div className="my-1 border-t" />}
              <button
                type="button"
                role="menuitem"
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-muted",
                  o.quick && "font-medium",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onMove(task.id, o.status);
                }}
              >
                <span aria-hidden>{o.emoji}</span>
                {o.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Board Critter (D-M3-8): the card doubles as a who's-working map. */
function RunCritter({ link }: { link: TaskRunLink }) {
  const status = useSessionsStore((s) => s.sessions[sessionKey(link.session)]?.status);
  if (!status || status === "Ended") return null;
  return (
    <span data-testid="board-critter" title={`${link.agentName ?? "agent"} is on it`} className="shrink-0">
      <StatusEmoji status={status} className="text-xs" />
    </span>
  );
}

/** dnd-kit sortable wrapper (T11): pointer + keyboard drag, board only. */
export function SortableTaskCard(
  props: Omit<TaskCardProps, "innerRef" | "style" | "dragProps" | "dragging">,
) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.task.id,
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };
  return (
    <TaskCard
      {...props}
      innerRef={setNodeRef}
      style={style}
      dragProps={{ ...attributes, ...listeners }}
      dragging={isDragging}
    />
  );
}

export function TaskCard({
  task,
  room,
  assignee,
  project,
  link,
  onOpen,
  onMove,
  innerRef,
  style,
  dragProps,
  dragging,
}: TaskCardProps) {
  const priority = PRIORITY_CONFIG[task.priority as TaskPriority];
  const sortableKeyDown = dragProps?.onKeyDown as React.KeyboardEventHandler | undefined;
  return (
    <div
      ref={innerRef}
      style={style}
      {...dragProps}
      data-testid={`task-card-${task.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        // The sortable lift (Space, D-M3-1 keyboard DnD) goes first; Enter
        // stays ours and opens the drawer.
        sortableKeyDown?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) onOpen(task.id);
      }}
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-md border bg-background p-2 text-left shadow-sm hover:border-ring",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 text-xs font-medium leading-snug">{task.title}</span>
        {link && (
          <span className="flex shrink-0 items-center gap-0.5" data-testid={`run-link-${task.id}`}>
            <span aria-hidden className="text-xs" title={link.agentName ?? "agent"}>
              {assignee?.icon ?? "🤖"}
            </span>
            <RunCritter link={link} />
          </span>
        )}
        <QuickMoveMenu task={task} onMove={onMove} />
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        {priority && (
          <span title={`priority: ${priority.label}`} data-testid="priority-chip">
            {priority.emoji} {priority.label}
          </span>
        )}
        {assignee && !link && (
          <span title={`assigned to ${assignee.name}`} data-testid="assignee-chip">
            {assignee.icon ?? "🤖"} {assignee.name}
          </span>
        )}
        {room && (
          <span
            data-testid="room-chip"
            className="rounded border px-1"
            style={room.color ? { borderColor: room.color } : undefined}
          >
            {room.icon ?? "🚪"} {room.name}
          </span>
        )}
        {project && (
          <span
            data-testid="project-chip"
            className="rounded px-1"
            style={project.color ? { backgroundColor: `${project.color}33` } : undefined}
          >
            {project.icon ?? "📁"} {project.name}
          </span>
        )}
        {task.updated_at > task.created_at && (
          <span aria-hidden title="has history" data-testid="activity-dot" className="ml-auto">
            •
          </span>
        )}
      </div>
    </div>
  );
}
