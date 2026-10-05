/* The jump list: a searchable list of districts, projects and agents that flies the camera there. Keyboard first: the
   focus stays in the search field, the arrow keys move the active row, Enter jumps, Escape closes. With nothing typed
   the list leads with what needs a person. On a phone it is the main way around a region. */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Bot, Building2, Landmark, Map as MapIcon, TriangleAlert, X } from "lucide-react";
import { searchJumps, type JumpEntry, type JumpKind } from "../world/wayfinding";
import { Button, Card, Field } from "./primitives";

const KIND_ICON: Record<JumpKind, typeof Bot> = { zone: MapIcon, building: Building2, agent: Bot, civic: Landmark };
const KIND_WORD: Record<JumpKind, string> = { zone: "District", building: "Project", agent: "Agent", civic: "Town" };

interface Props {
  entries: readonly JumpEntry[];
  onJump: (entry: JumpEntry) => void;
  onClose: () => void;
}

export function JumpList({ entries, onJump, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLUListElement>(null);
  const results = useMemo(() => searchJumps(entries, query), [entries, query]);
  const current = Math.min(active, Math.max(0, results.length - 1));
  useEffect(() => input.current?.focus(), []);
  // Keep the active row in sight while the arrow keys move it.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [current, results]);

  const key = (e: KeyboardEvent) => {
    const move = (to: number) => {
      e.preventDefault();
      if (results.length) setActive((to + results.length) % results.length);
    };
    if (e.key === "ArrowDown") move(current + 1);
    else if (e.key === "ArrowUp") move(current - 1);
    else if (e.key === "Home" && results.length && !query) move(0);
    else if (e.key === "End" && results.length && !query) move(results.length - 1);
    else if (e.key === "Enter") {
      e.preventDefault();
      const entry = results[current];
      if (entry) onJump(entry);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab") {
      // The dialog has one stop besides its close button: Tab does not wander into the world behind it.
      const close = e.currentTarget.querySelector<HTMLElement>(".jump-close");
      if (!close) return;
      e.preventDefault();
      (document.activeElement === close ? input.current : close)?.focus();
    }
  };

  const needy = results.filter((r) => r.needs > 0).length;
  return (
    <>
      <div className="jump-scrim" onPointerDown={onClose} />
      <Card className="world-sheet jump-sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={key}>
        <Card.Header
          title="Jump to"
          titleId={`${id}-title`}
          action={<Button className="jump-close" variant="ghost" size="sm" iconOnly aria-label="Close the jump list" icon={<X className="icon" aria-hidden="true" />} onClick={onClose} />}
        />
        <Card.Body>
          <Field
            ref={input}
            label="Search districts, projects and agents"
            hideLabel
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={results[current] ? `${id}-${current}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            enterKeyHint="go"
            placeholder="Search districts, projects and agents"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setActive(0);
            }}
          />
          <p className="sr-only" role="status" aria-live="polite">
            {results.length ? `${results.length} ${results.length === 1 ? "place" : "places"}${!query && needy ? `, ${needy} that need a person first` : ""}.` : "Nothing by that name."}
          </p>
          <ul ref={list} id={`${id}-list`} className="jump-results" role="listbox" aria-label="Places">
            {results.map((entry, index) => {
              const Icon = KIND_ICON[entry.kind];
              return (
                <li
                  key={entry.id}
                  id={`${id}-${index}`}
                  role="option"
                  className="jump-row"
                  aria-selected={index === current}
                  data-active={index === current ? "" : undefined}
                  data-kind={entry.kind}
                  onPointerMove={() => index !== current && setActive(index)}
                  onClick={() => onJump(entry)}
                >
                  <Icon className="icon jump-icon" aria-hidden="true" />
                  <span className="jump-text">
                    <span className="jump-label">
                      <strong>{entry.label}</strong>
                      <span className="jump-kind">{KIND_WORD[entry.kind]}</span>
                    </span>
                    <span className="jump-detail">{entry.detail}</span>
                  </span>
                  {entry.needs > 0 && (
                    <span className="jump-needs" title="Needs a person">
                      <TriangleAlert className="icon icon-sm" aria-hidden="true" />
                      <span className="sr-only">Needs a person</span>
                    </span>
                  )}
                </li>
              );
            })}
            {!results.length && <li className="jump-empty">Nothing by that name. Try a project key or an agent's name.</li>}
          </ul>
          <p className="jump-keys" aria-hidden="true">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> to move, <span className="kbd">Enter</span> to go, <span className="kbd">Esc</span> to close
          </p>
        </Card.Body>
      </Card>
    </>
  );
}
