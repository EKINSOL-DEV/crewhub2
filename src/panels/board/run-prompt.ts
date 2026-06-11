// The Run-with-agent prompt envelope (T12, D-M3-6): a card becomes a managed
// session with this as SpawnSpec.prompt. Pure — TDD'd before the dialog
// mounts it. The acting_as line teaches the agent to attribute its MCP moves
// (D-M3-4); one-off runs omit it (nothing to attribute to).
import type { Room, Task } from "@/ipc/bindings";

export function buildRunPrompt(task: Task, room: Room | null, agentId: string | null): string {
  const lines = [
    `You are working on CrewHub task ${task.id} — "${task.title}" (priority ${task.priority}, room ${room?.name ?? "—"}).`,
  ];
  if (task.description?.trim()) {
    lines.push("", task.description.trim());
  }
  const actingAs = agentId ? `, acting_as="${agentId}"` : "";
  lines.push(
    "",
    `When you make progress, call mcp__crewhub__update_task_status (task_id="${task.id}"${actingAs}); move it to "review" when you believe it is done.`,
  );
  return lines.join("\n");
}

/** SpawnSpec.permission_mode is a closed enum — agents store free strings. */
export function asPermissionMode(
  v: string | null | undefined,
): "Default" | "AcceptEdits" | "Plan" | "BypassPermissions" {
  return v === "AcceptEdits" || v === "Plan" || v === "BypassPermissions" ? v : "Default";
}
