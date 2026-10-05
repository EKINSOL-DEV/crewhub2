/* Build mode's palette (plan 4.7 item 3): the catalogue in groups ("Mine" first), the chosen prop's verdict in words,
   the selected prop's actions, undo and redo, the prop editor, and the demo's "Request a prop". Only shown while
   build mode is on. Kit Cards, Buttons, Fields and Chips only. */
import { useState, type FormEvent } from "react";
import { FlaskConical, Hammer, Pencil, Plus, Redo2, RotateCw, Trash2, Undo2, X } from "lucide-react";
import type { Building, CatalogueGroupId } from "@crewhub/world-model";
import type { BuildMode } from "../state/build";
import type { TownState } from "../state/town";
import { SCENARIO, useWorld } from "../state/world";
import { Button, Card, Chip, Field } from "./primitives";
import { BuildZones } from "./ZonePanel";

interface Props {
  build: BuildMode;
  town: TownState;
  inside: Building | null;
  demo: boolean;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onEdit: (propId: string | null) => void;
  onRequest: (thing: string) => string;
}

const ROTATION_WORDS = ["facing the camera", "turned a quarter", "turned half", "turned three quarters"] as const;

export function BuildPanel({ build, town, inside, demo, onClose, onUndo, onRedo, onEdit, onRequest }: Props) {
  const { model } = useWorld();
  const groups = town.catalogue.groups();
  const [group, setGroup] = useState<CatalogueGroupId>(groups[0]?.id ?? "work");
  const shown = groups.find((g) => g.id === group) ?? groups[0];
  const [thing, setThing] = useState("");
  const [requested, setRequested] = useState("");
  const { state, check, selectedPlacement } = build;
  const chosen = state.propId ? town.catalogue.get(state.propId) : null;
  const selected = selectedPlacement ? town.catalogue.get(selectedPlacement.propId) : null;

  const request = (e: FormEvent) => {
    e.preventDefault();
    if (!thing.trim()) return;
    setRequested(onRequest(thing));
    setThing("");
  };

  return (
    <Card as="section" className="world-sheet build-sheet" aria-labelledby="build-title">
      <Card.Header
        title={
          <span className="build-title">
            <Hammer className="icon" aria-hidden="true" />
            Build
          </span>
        }
        titleId="build-title"
        action={<Button variant="ghost" size="sm" iconOnly aria-label="Leave build mode (B)" title="Leave build mode (B)" icon={<X className="icon" aria-hidden="true" />} onClick={onClose} />}
      />
      <Card.Body>
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
          {!inside
            ? "Enter a building to place props."
            : selectedPlacement
              ? `${selected?.name ?? selectedPlacement.propId} selected, ${ROTATION_WORDS[selectedPlacement.rotation]}.`
              : chosen
                ? check
                  ? check.ok
                    ? `${chosen.name} fits here.`
                    : `${chosen.name} can't stand here: ${check.reason}`
                  : `${chosen.name}: point at a floor or use the arrow keys.`
                : "Choose a prop, or click a placed prop to select it."}
          {state.message && <span className="build-message">{state.message}</span>}
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
              >
                <span className="palette-name">{entry.name}</span>
                <span className="palette-meta">
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

        <BuildZones model={model} town={town} inside={inside} />

        {demo && (
          <form className="build-request" onSubmit={request}>
            <Field
              label={
                <span className="build-request-label">
                  Request a prop
                  <Chip icon={<FlaskConical className="icon icon-sm" aria-hidden="true" />}>Demo</Chip>
                </span>
              }
              size="sm"
              placeholder="a coffee machine"
              value={thing}
              maxLength={80}
              onChange={(e) => setThing(e.currentTarget.value)}
              hint={requested || `Opens a Prop ticket in the ${SCENARIO.props.projectName} building; when a person moves it to Done, the prop appears.`}
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
