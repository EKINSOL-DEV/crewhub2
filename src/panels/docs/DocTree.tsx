// Collapsible doc tree (M3 T9, EKI-89): dirs toggle, markdown/image files
// select into the content pane. Pure rendering over buildDocTree's nodes.
import { useState } from "react";
import { isImagePath, type DocNode } from "./doc-tree";

function NodeRow({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: DocNode;
  depth: number;
  selected: string | null;
  onSelect: (relPath: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0); // top-level dirs start open
  const { entry } = node;

  if (entry.is_dir) {
    return (
      <div>
        <button
          type="button"
          data-testid={`doc-dir-${entry.rel_path}`}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent/10"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          <span aria-hidden>📁</span>
          <span className="truncate">{entry.name}</span>
        </button>
        {open &&
          node.children.map((child) => (
            <NodeRow
              key={child.entry.rel_path}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid={`doc-file-${entry.rel_path}`}
      className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent/10 ${
        selected === entry.rel_path ? "bg-accent/20" : ""
      }`}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      onClick={() => onSelect(entry.rel_path)}
    >
      <span aria-hidden>{isImagePath(entry.rel_path) ? "🖼️" : "📄"}</span>
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

export function DocTree({
  nodes,
  selected,
  onSelect,
}: {
  nodes: DocNode[];
  selected: string | null;
  onSelect: (relPath: string) => void;
}) {
  return (
    <nav data-testid="doc-tree" aria-label="Project docs" className="flex flex-col">
      {nodes.map((node) => (
        <NodeRow key={node.entry.rel_path} node={node} depth={0} selected={selected} onSelect={onSelect} />
      ))}
    </nav>
  );
}
