/* Build mode's palette (plan 4.7 item 3): the catalogue in groups ("Mine" first), the chosen prop's verdict in words,
   the selected prop's actions, undo and redo, the prop editor, and the demo's "Request a prop". Only shown while
   build mode is on. Kit Cards, Buttons, Fields and Chips only. On a phone (world.css, under 600 px, where the sheet lies
   over the lower part of the screen) two buttons show the palette alone or the rest, so the sheet stands shorter over
   the floor a prop goes on (round 65, walk finding w4-18); wider, the buttons are not drawn and everything shows. */
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { FlaskConical, Hammer, Pencil, Plus, Redo2, RotateCw, Trash2, Undo2, X } from "lucide-react";
import type { Building, CatalogueGroupId } from "@crewhub/world-model";
import type { BuildMode } from "../state/build";
import { buildWords } from "../state/inputWords";
import { useTouchInput } from "../state/media";
import type { TownState } from "../state/town";
import { mediaList } from "../state/media";
import { pageConfig } from "../state/page";
import { useWorld } from "../state/runtimes";
import { Button, Card, Chip, Field } from "./primitives";
import { BuildLayout } from "./LayoutPanel";
import type { TownPlan } from "../world/townPlan";
import { buildStatusLine } from "../world/buildStatus";
import { BuildZones } from "./ZonePanel";
import { elsewhereWords } from "../world/elsewhereWords";

interface Props {
  build: BuildMode;
  town: TownState;
  /** Where every building stands: build mode's layout part moves them. */
  plan: TownPlan;
  inside: Building | null;
  demo: boolean;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onEdit: (propId: string | null) => void;
  onRequest: (thing: string) => string;
}

/** Where the sheet lies along the bottom of the screen (world.css). */
const PHONE_SHEET = "(max-width: 600px)";

export function BuildPanel({ build, town, plan, inside, demo, onClose, onUndo, onRedo, onEdit, onRequest }: Props) {
  // The sheet's words by input kind (round 65, w4-2): tap, not click, and no key on a touch device.
  const words = buildWords(useTouchInput());
  const { model } = useWorld();
  const groups = town.catalogue.groups();
  const [group, setGroup] = useState<CatalogueGroupId>(groups[0]?.id ?? "work");
  const shown = groups.find((g) => g.id === group) ?? groups[0];
  const [thing, setThing] = useState("");
  const [requested, setRequested] = useState("");
  const [part, setPart] = useState<"props" | "more">("props");
  const { state, check, selectedPlacement } = build;
  const chosen = state.propId ? town.catalogue.get(state.propId) : null;
  const selected = selectedPlacement ? town.catalogue.get(selectedPlacement.propId) : null;
  // Another browser's move brought the town's last revision (round 65, w6-12): said here, in the sheet and the live region.
  const elsewhere = town.elsewhere ? elsewhereWords(town.elsewhere) : null;
  // On a phone the short body is scrolled to its top when a prop is chosen or selected, or the part changes: Turn, Place and
  // Done go in above a palette scrolled away, and More would open at the palette's scroll (m1's review of w4-18).
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (body.current && mediaList(PHONE_SHEET).matches) body.current.scrollTop = 0;
  }, [state.propId, state.selected, part]);

  const request = (e: FormEvent) => {
    e.preventDefault();
    if (!thing.trim()) return;
    setRequested(onRequest(thing));
    setThing("");
  };

  return (
    <Card as="section" className="world-sheet build-sheet" aria-labelledby="build-title" data-part={part}>
      <Card.Header
        title={
          <span className="build-title">
            <Hammer className="icon" aria-hidden="true" />
            Build
          </span>
        }
        titleId="build-title"
        action={
          <div className="build-header-actions">
            {/* In the header, which never scrolls away with the palette. */}
            <div className="build-parts" role="group" aria-label="Part of the build sheet">
              <Button size="sm" variant={part === "props" ? "primary" : "default"} pressed={part === "props"} onClick={() => setPart("props")}>
                Props
              </Button>
              <Button size="sm" variant={part === "more" ? "primary" : "default"} pressed={part === "more"} onClick={() => setPart("more")}>
                More
              </Button>
            </div>
            <Button variant="ghost" size="sm" iconOnly aria-label="Leave build mode (B)" title="Leave build mode (B)" icon={<X className="icon" aria-hidden="true" />} onClick={onClose} />
          </div>
        }
      />
      <Card.Body ref={body}>
        <div className="build-toolbar" role="toolbar" aria-label="Build actions">
          <Button size="sm" icon={<Undo2 className="icon" aria-hidden="true" />} disabled={!town.canUndo} onClick={onUndo} title="Undo (Ctrl/Cmd+Z)">
            Undo
          </Button>
          <Button size="sm" icon={<Redo2 className="icon" aria-hidden="true" />} disabled={!town.canRedo} onClick={onRedo} title="Redo (Shift+Ctrl/Cmd+Z)">
            Redo
          </Button>
          <Button size="sm" icon={<Plus className="icon" aria-hidden="true" />} onClick={() => onEdit(null)}>
            New prop
          </Button>
        </div>

        <p className="build-status" role="status" aria-live="polite">
          {buildStatusLine({
            inside: inside !== null,
            selected: selectedPlacement ? { name: selected?.name ?? selectedPlacement.propId, rotation: selectedPlacement.rotation } : null,
            chosen: chosen?.name ?? null,
            check,
            message: state.message,
            words,
          })}
          {state.message && <span className="build-message">{state.message}</span>}
        </p>
        <p className="hint build-elsewhere" role="status" aria-live="polite">
          {elsewhere}
        </p>
        {chosen && check && (
          <Chip className={check.ok ? "ghost-ok" : "ghost-bad"} aria-hidden="true">
            {check.ok ? "fits" : "does not fit"}
          </Chip>
        )}

        {selectedPlacement && (
          <div className="build-actions" role="group" aria-label="Selected prop">
            <Button size="sm" icon={<RotateCw className="icon" aria-hidden="true" />} onClick={build.rotate} kbd="R">
              Turn
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="icon" aria-hidden="true" />} onClick={build.remove} kbd="Del">
              Delete
            </Button>
          </div>
        )}
        {chosen && !selectedPlacement && inside && (
          <div className="build-actions" role="group" aria-label="Chosen prop">
            <Button size="sm" icon={<RotateCw className="icon" aria-hidden="true" />} onClick={build.rotate} kbd="R">
              Turn
            </Button>
            <Button size="sm" variant="primary" disabled={!check?.ok} onClick={build.place} kbd="Enter">
              Place
            </Button>
            <Button size="sm" variant="ghost" onClick={() => build.choose(null)} kbd="Esc">
              Done
            </Button>
          </div>
        )}

        <div className="build-groups" role="group" aria-label="Prop groups">
          {groups.map((g) => (
            <Button key={g.id} size="sm" variant={shown?.id === g.id ? "primary" : "default"} pressed={shown?.id === g.id} onClick={() => setGroup(g.id)}>
              {g.label}
            </Button>
          ))}
        </div>
        <ul className="build-palette" aria-label={`${shown?.label ?? ""} props`}>
          {shown?.entries.map((entry) => (
            <li key={entry.id}>
              <Button
                size="sm"
                className="palette-item"
                data-prop-id={entry.id}
                pressed={state.propId === entry.id}
                onClick={() => build.choose(entry.id)}
                title={`${entry.name}: ${entry.definition.footprint.width} by ${entry.definition.footprint.depth} cells`}
                // The name is the prop's alone; the footprint and provenance describe it (round 65, w5-15: "Workstation3×2").
                aria-describedby={`palette-meta-${entry.id}`}
              >
                <span className="palette-name">{entry.name}</span>
                <span className="palette-meta" id={`palette-meta-${entry.id}`} aria-hidden="true">
                  {entry.definition.footprint.width}×{entry.definition.footprint.depth}
                  {entry.provenance && ` · ${entry.provenance.kind === "ticket" ? `from ${entry.provenance.ticketKey}` : "local"}`}
                </span>
              </Button>
              {entry.source === "user" && (
                <Button size="sm" variant="ghost" iconOnly aria-label={`Edit ${entry.name}`} title={`Edit ${entry.name}`} icon={<Pencil className="icon" aria-hidden="true" />} onClick={() => onEdit(entry.id)} />
              )}
            </li>
          ))}
        </ul>

        <BuildLayout model={model} town={town} plan={plan} inside={inside} />

        <BuildZones model={model} town={town} inside={inside} />

        {demo && (
          <form className="build-request" onSubmit={request}>
            <Field
              label={
                <span className="build-request-label">
                  Request a prop
                  {/* The chip is a visual mark; in the name it read "Request a propDemo" (round 65, w5-15). */}
                  <Chip icon={<FlaskConical className="icon icon-sm" aria-hidden="true" />} aria-hidden="true">
                    Demo
                  </Chip>
                </span>
              }
              size="sm"
              placeholder="a coffee machine"
              value={thing}
              maxLength={80}
              onChange={(e) => setThing(e.currentTarget.value)}
              hint={requested || `Opens a Prop ticket in the ${pageConfig().scenario.props.projectName} building; when a person moves it to Done, the prop appears.`}
            />
            <Button size="sm" type="submit" disabled={!thing.trim()}>
              Request
            </Button>
          </form>
        )}
      </Card.Body>
    </Card>
  );
}
