// Subagent & team tree (T16, EKI-54): the collapsible forest view of the
// sessions panel, fed by the pure buildSessionForest selector (D-M4-9).
// Every node shows a live status dot + a humanized name (never `parent=` or
// a bare uuid — the v1 lesson); team members render as a bracketed 👥 group
// when the provider supplied `team` (progressive enhancement — subagent
// trees alone satisfy the core AC). Clicking opens the transcript: live for
// roots, read-only history for sidechains.
import { useState } from "react";
import { openChatPanel } from "@/app/open-chat";
import { StatusEmoji } from "@/components/StatusEmoji";
import { humanizeId } from "@/panels/chat/humanize";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import {
  buildSessionForest,
  groupSiblingsByTeam,
  matchesProjectFilter,
  sessionKey,
  useSessionsStore,
  type ForestEntry,
  type SessionTreeNode,
} from "@/stores/sessions";

/** display_name ?? bound agent name ?? humanized id (readable, always). */
function useDisplayName(node: SessionTreeNode): string {
  const binding = useBindingsStore((s) => s.bindings[node.meta.id.id]);
  const agentName = useAgentsStore((s) =>
    binding?.agent_id ? s.agents.find((a) => a.id === binding.agent_id)?.name : undefined,
  );
  return binding?.display_name ?? agentName ?? humanizeId(node.meta.id.id);
}

function openNode(node: SessionTreeNode): void {
  openChatPanel({
    provider: node.meta.id.provider,
    id: node.meta.id.id,
    // sidechains open read-only (their parent owns the conversation)
    ...(node.meta.parent ? { mode: "history" as const } : {}),
  });
}

function TreeNodeRow({ node, depth }: { node: SessionTreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const name = useDisplayName(node);

  return (
    <li data-testid={`tree-node-${node.meta.id.id}`}>
      <div className="flex items-center gap-1 py-0.5 text-xs">
        {node.children.length > 0 || depth === 0 ? (
          <button
            type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
            data-testid={`tree-toggle-${node.meta.id.id}`}
            className="w-4 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <StatusEmoji status={node.meta.status} />
        <button
          type="button"
          data-testid={`tree-open-${node.meta.id.id}`}
          className="truncate text-left font-medium hover:underline"
          title={node.meta.id.id}
          onClick={() => openNode(node)}
        >
          {name}
        </button>
        {node.meta.team && (
          <span
            data-testid={`team-badge-${node.meta.id.id}`}
            className="rounded bg-accent/20 px-1 text-[10px] text-accent"
            title={`team ${node.meta.team.team_id} — ${node.meta.team.role}`}
          >
            👥 {node.meta.team.role}
          </span>
        )}
        {node.meta.parent && <span className="text-[10px] text-muted-foreground">subagent</span>}
      </div>
      {expanded && node.children.length > 0 && (
        <div className="ml-2 border-l border-border pl-2">
          <TreeLevel siblings={node.children} depth={depth + 1} />
        </div>
      )}
      {expanded && depth === 0 && node.children.length === 0 && (
        <p className="ml-6 text-[10px] text-muted-foreground" data-testid="tree-no-subagents">
          🌱 no subagents spawned in this session
        </p>
      )}
    </li>
  );
}

function TeamGroup({ entry, depth }: { entry: ForestEntry & { kind: "team" }; depth: number }) {
  return (
    <li data-testid={`team-group-${entry.teamId}`} className="rounded border border-accent/40 p-1">
      <p className="px-1 text-[10px] font-medium text-accent">👥 {entry.teamId}</p>
      <TreeLevel siblings={entry.nodes} depth={depth} grouped />
    </li>
  );
}

function TreeLevel({
  siblings,
  depth,
  grouped = false,
}: {
  siblings: SessionTreeNode[];
  depth: number;
  /** Inside a team bracket already — don't re-group (teams don't nest). */
  grouped?: boolean;
}) {
  const entries: ForestEntry[] = grouped
    ? siblings.map((node) => ({ kind: "session", node }))
    : groupSiblingsByTeam(siblings);
  return (
    <ul className="flex flex-col">
      {entries.map((e) =>
        e.kind === "session" ? (
          <TreeNodeRow key={e.node.key} node={e.node} depth={depth} />
        ) : (
          <TeamGroup key={`team-${e.teamId}`} entry={e} depth={depth} />
        ),
      )}
    </ul>
  );
}

/** The sessions-panel tree view (mode "tree"). */
export function SessionTree({ projectFilter }: { projectFilter: string | null }) {
  const sessions = useSessionsStore((s) => s.sessions);
  const scoped = Object.fromEntries(
    Object.entries(sessions).filter(([, m]) => matchesProjectFilter(m.project_path, projectFilter)),
  );
  const forest = buildSessionForest(scoped);
  return (
    <div data-testid="session-tree">
      <TreeLevel siblings={forest} depth={0} />
    </div>
  );
}

/**
 * Compact subagent strip for the chat header (T16): the open session's
 * children as clickable status chips. Renders nothing when there are none —
 * the 🌱 empty state lives in the tree, not in every chat's header.
 */
export function SubagentStrip({ parentKey }: { parentKey: string }) {
  const sessions = useSessionsStore((s) => s.sessions);
  const children = Object.values(sessions).filter(
    (m) => !m.removed && m.parent && sessionKey(m.parent) === parentKey,
  );
  if (children.length === 0) return null;
  return (
    <span data-testid="subagent-strip" className="flex items-center gap-1 overflow-hidden">
      {children
        .sort((a, b) => b.last_activity_ms - a.last_activity_ms)
        .slice(0, 4)
        .map((m) => (
          <button
            key={m.id.id}
            type="button"
            data-testid={`subagent-chip-${m.id.id}`}
            className="flex max-w-32 items-center gap-1 truncate rounded-full border border-border px-1.5 py-0 text-[10px] hover:bg-accent/20"
            title={`subagent · ${m.id.id}`}
            onClick={() => openChatPanel({ provider: m.id.provider, id: m.id.id, mode: "history" })}
          >
            <StatusEmoji status={m.status} />
            {humanizeId(m.id.id)}
          </button>
        ))}
      {children.length > 4 && (
        <span className="text-[10px] text-muted-foreground">+{children.length - 4}</span>
      )}
    </span>
  );
}
