/* The minimal prop editor (plan 6.2): add a primitive, move, turn and size it on a 5 cm grid (turns in 15 degree
   steps), pick a named material, set the footprint, name and category; a live preview through the style's parts
   renderer; Save runs `validatePropModel` and lists its errors. One prop's JSON can be exported and imported. Zero
   cost: nothing here calls a model. */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Download, Trash2, X } from "lucide-react";
import {
  PROP_CATEGORIES,
  PROP_LIMITS,
  PROP_MATERIALS,
  PROP_SHAPES,
  validatePropModel,
  type PropCategory,
  type PropIssue,
  type PropMaterial,
  type PropModel,
  type PropPart,
  type Vec3,
} from "@crewhub/world-engine";
import type { StyleTheme } from "@crewhub/world-style";
import { blankProp, draftToModel, EDITOR_STEP, newPart, SIZE_FIELDS, snap, TURN_STEP } from "../world/propEditor";
import { downloadText } from "./download";
import { PartsPreview } from "./PartsPreview";
import { Button, Card, Field } from "./primitives";

interface Props {
  /** The user prop to edit, or null for a new one. */
  initial: PropModel | null;
  /** Ids already in the catalogue: a new prop may not take one. */
  takenIds: readonly string[];
  theme: StyleTheme;
  onSave: (prop: PropModel) => string | null;
  onClose: () => void;
}

const AXES = ["x", "y", "z"] as const;

/** A number field that keeps what is typed and commits the snapped value; it shows the snapped value once left. */
function NumberField({ label, value, step, min, max, onCommit }: { label: string; value: number; step: number; min?: number; max?: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(String(value));
  }, [editing, value]);
  return (
    <Field
      label={label}
      size="sm"
      type="number"
      inputMode="decimal"
      step={step}
      {...(min !== undefined ? { min } : {})}
      {...(max !== undefined ? { max } : {})}
      value={text}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        setText(e.currentTarget.value);
        const n = Number.parseFloat(e.currentTarget.value);
        if (Number.isFinite(n)) onCommit(snap(n, step));
      }}
    />
  );
}

export function PropEditor({ initial, takenIds, theme, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<PropModel>(() => structuredClone(initial ?? blankProp()));
  const keepId = initial?.id ?? null;
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<PropIssue[]>([]);
  const [note, setNote] = useState("");
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (errors.length) errorBox.current?.scrollIntoView({ block: "nearest" });
  }, [errors]);
  const part = draft.parts[index] ?? null;
  const preview = draftToModel(draft, keepId);

  const change = (next: Partial<PropModel>) => {
    setDraft((d) => ({ ...d, ...next }));
    setErrors([]);
  };
  const changePart = (update: (p: PropPart) => PropPart) =>
    setDraft((d) => ({ ...d, parts: d.parts.map((p, i) => (i === index ? update(p) : p)) }));
  const setAxis = (key: "position" | "rotation" | "size", axis: number, v: number) =>
    changePart((p) => {
      const vec = [...(p[key] ?? [0, 0, 0])] as Vec3;
      vec[axis] = v;
      return { ...p, [key]: vec };
    });

  const save = () => {
    const model = draftToModel(draft, keepId);
    if (!keepId && takenIds.includes(model.id)) {
      setErrors([{ path: "name", message: `another prop already has the id ${model.id}; choose another name or edit that prop` }]);
      return;
    }
    const result = validatePropModel(model);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const error = onSave(result.value);
    if (error) setErrors([{ path: "(town)", message: error }]);
  };

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setErrors([{ path: "(file)", message: `${file.name} is not JSON` }]);
      return;
    }
    const result = validatePropModel(json);
    if (!result.ok) {
      setErrors(result.errors);
      setNote(`${file.name} was not loaded.`);
      return;
    }
    setDraft({ ...result.value, provenance: { kind: "local" } });
    setIndex(0);
    setErrors([]);
    setNote(`Loaded ${file.name}. Save adds it to Mine.`);
  };

  return (
    <Card as="section" className="world-sheet editor-sheet" role="dialog" aria-labelledby="editor-title">
      <Card.Header
        title={keepId ? `Edit ${initial?.name}` : "New prop"}
        titleId="editor-title"
        action={<Button variant="ghost" size="sm" iconOnly aria-label="Close the prop editor" icon={<X className="icon" aria-hidden="true" />} onClick={onClose} />}
      />
      <Card.Body className="editor-body">
        <PartsPreview prop={preview} theme={theme} />
        <div className="editor-fields">
          <Field label="Name" size="sm" value={draft.name} maxLength={PROP_LIMITS.nameMax} onChange={(e) => change({ name: e.currentTarget.value })} hint={keepId ? `Id ${keepId}` : `Id ${preview.id}`} />
          <Field control="select" label="Category" size="sm" value={draft.category} onChange={(e) => change({ category: e.currentTarget.value as PropCategory })}>
            {PROP_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Field>
          <fieldset className="editor-row">
            <legend className="label">Footprint (cells of {PROP_LIMITS.cellSize} m)</legend>
            <NumberField label="Width" value={draft.footprint.width} step={1} min={1} max={PROP_LIMITS.footprintMax} onCommit={(v) => change({ footprint: { ...draft.footprint, width: v } })} />
            <NumberField label="Depth" value={draft.footprint.depth} step={1} min={1} max={PROP_LIMITS.footprintMax} onCommit={(v) => change({ footprint: { ...draft.footprint, depth: v } })} />
          </fieldset>
          <Field control="checkbox" label="Blocks walking" checked={draft.blocksMovement} onChange={(e) => change({ blocksMovement: e.currentTarget.checked })} />

          <div className="editor-add" role="group" aria-label="Add a part">
            <span className="label">Add a part</span>
            {PROP_SHAPES.map((shape) => (
              <Button
                key={shape}
                size="sm"
                disabled={draft.parts.length >= PROP_LIMITS.partsMax}
                onClick={() => {
                  setDraft((d) => ({ ...d, parts: [...d.parts, newPart(shape)] }));
                  setIndex(draft.parts.length);
                  setErrors([]);
                }}
              >
                {shape}
              </Button>
            ))}
          </div>
          <ul className="editor-parts" aria-label="Parts">
            {draft.parts.map((p, i) => (
              <li key={i}>
                <Button size="sm" pressed={i === index} onClick={() => setIndex(i)}>
                  {i + 1}. {p.shape}, {p.material}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  aria-label={`Remove part ${i + 1}`}
                  disabled={draft.parts.length <= 1}
                  icon={<Trash2 className="icon" aria-hidden="true" />}
                  onClick={() => {
                    setDraft((d) => ({ ...d, parts: d.parts.filter((_, j) => j !== i) }));
                    setIndex((n) => Math.max(0, Math.min(n, draft.parts.length - 2)));
                  }}
                />
              </li>
            ))}
          </ul>

          {part && (
            <div className="editor-part" key={index}>
              <fieldset className="editor-row">
                <legend className="label">Position (m, {EDITOR_STEP} steps)</legend>
                {AXES.map((axis, a) => (
                  <NumberField key={axis} label={axis} value={part.position[a]!} step={EDITOR_STEP} onCommit={(v) => setAxis("position", a, v)} />
                ))}
              </fieldset>
              <fieldset className="editor-row">
                <legend className="label">Turn (degrees, {TURN_STEP} steps)</legend>
                {AXES.map((axis, a) => (
                  <NumberField key={axis} label={axis} value={part.rotation?.[a] ?? 0} step={TURN_STEP} onCommit={(v) => setAxis("rotation", a, v)} />
                ))}
              </fieldset>
              <fieldset className="editor-row">
                <legend className="label">Size (m)</legend>
                {SIZE_FIELDS[part.shape].map((name, a) =>
                  name ? <NumberField key={name} label={name} value={part.size[a]!} step={EDITOR_STEP} min={0} max={PROP_LIMITS.sizeMax} onCommit={(v) => setAxis("size", a, v)} /> : null,
                )}
                {part.shape === "wedge" ? (
                  <NumberField label="sweep (degrees)" value={part.sweep ?? 90} step={TURN_STEP} min={PROP_LIMITS.sweepMin} max={PROP_LIMITS.sweepMax} onCommit={(v) => changePart((p) => ({ ...p, sweep: v }))} />
                ) : null}
              </fieldset>
              <Field control="select" label="Material" size="sm" value={part.material} onChange={(e) => {
                  const material = e.currentTarget.value as PropMaterial;
                  changePart((p) => ({ ...p, material }));
                }}
              >
                {PROP_MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Field>
              <Field
                control="checkbox"
                label="Glows"
                checked={!!part.emissive}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  changePart((p) => {
                    const { emissive: _, ...rest } = p;
                    return on ? { ...rest, emissive: true } : rest;
                  });
                }}
              />
            </div>
          )}

          {errors.length > 0 && (
            <div ref={errorBox} className="editor-errors" role="alert">
              <strong>Not saved:</strong>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>
                    <code>{e.path}</code> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {note && <p className="hint">{note}</p>}
        </div>
      </Card.Body>
      <Card.Footer className="editor-footer">
        <Button variant="primary" size="sm" onClick={save}>
          Save
        </Button>
        <Button size="sm" icon={<Download className="icon" aria-hidden="true" />} onClick={() => downloadText(`${preview.id.slice("user:".length)}.json`, `${JSON.stringify(preview, null, 2)}\n`)}>
          Export JSON
        </Button>
        <Field control="file" size="sm" className="editor-import" label="Import a prop JSON" accept="application/json,.json" onChange={(e) => void importFile(e)} />
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </Card.Footer>
    </Card>
  );
}
