/* The casting room at /cast-preview (linked from Settings): every cast in the same Greenhouse sample room, alone or side
   by side, in every role and state. The controls put the whole cast into a state, let it walk, send the lead off with
   its workers in tow, let each figure carry on its own way and fly a ticket in by drone; the light, the graphics
   setting, reduced motion and a town-distance view (the far detail, through the robot crowd) are a click away.

   Every control is also a URL parameter, so a view can be shared and scripted: `?cast=<id>` or `?side=1`, `&state=`,
   `&scene=`, `&light=day|dusk|lamplight`, `&quality=fast`, `&motion=reduced`, `&view=far`, `&frame=room`, `&labels=0`. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphicsQuality } from "@crewhub/world-style";
import { Button, Field } from "./components/primitives";
import { readCast } from "./state/cast";
import { useDark, useTheme } from "./state/theme";
import { CastRoomScene, figureId, type CastRoomCamera } from "./world/castRoom";
import { previewCasts } from "./world/castRoomCasts";
import { MEMBERS, PREVIEW_LIGHTS, PREVIEW_SCENES, PREVIEW_STATES, roomPlays, type PreviewFraming, type PreviewLight, type PreviewScene, type PreviewStateId } from "./world/castRoomPlan";
import { DEFAULT_STYLE_ID, styleRegistry } from "./world/style";

const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const oneOf = <T extends string>(value: string | null, choices: readonly T[]): T | null => (choices.includes(value as T) ? (value as T) : null);

const CAMERA: readonly { action: CastRoomCamera; label: string }[] = [
  { action: "rotate-left", label: "Turn left" },
  { action: "rotate-right", label: "Turn right" },
  { action: "zoom-in", label: "Zoom in" },
  { action: "zoom-out", label: "Zoom out" },
  { action: "home", label: "Reset the view" },
];

export default function CastPreview() {
  const style = useMemo(() => styleRegistry.getStyle(DEFAULT_STYLE_ID), []);
  const casts = useMemo(() => previewCasts(style), [style]);
  const dark = useDark();
  const { setTheme } = useTheme();
  const [castId, setCastId] = useState(() => {
    // The address names the cast; else the room opens on the cast chosen in Settings.
    const asked = params.get("cast") ?? readCast();
    return casts.find((c) => c.id === asked)?.id ?? casts[0]!.id;
  });
  const [side, setSide] = useState(params.get("side") === "1");
  const [state, setState] = useState<PreviewStateId>(() => oneOf(params.get("state"), PREVIEW_STATES.map((s) => s.id)) ?? "working");
  const [scene, setScene] = useState<PreviewScene>(() => oneOf(params.get("scene"), PREVIEW_SCENES.map((s) => s.id)) ?? "desks");
  // The light follows the theme (light: day, dark: lamplight) until one is chosen; a theme change follows again.
  const [lightChoice, setLightChoice] = useState<PreviewLight | null>(() => oneOf(params.get("light"), PREVIEW_LIGHTS.map((l) => l.id)));
  const light = lightChoice ?? (dark ? "lamplight" : "day");
  const [quality, setQuality] = useState<GraphicsQuality>(params.get("quality") === "fast" ? "fast" : "pretty");
  const [reducedMotion, setReducedMotion] = useState(() => params.get("motion") === "reduced" || (params.get("motion") === null && window.matchMedia("(prefers-reduced-motion: reduce)").matches));
  const [far, setFar] = useState(params.get("view") === "far");
  const [framing, setFraming] = useState<PreviewFraming>(params.get("frame") === "room" ? "room" : "figures");
  const [labels, setLabels] = useState(params.get("labels") !== "0");
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const shown = useMemo(() => (side ? casts : casts.filter((c) => c.id === castId)), [casts, castId, side]);
  const view = useMemo(() => ({ casts: shown, state, scene, light, quality, reducedMotion, far, framing }), [shown, state, scene, light, quality, reducedMotion, far, framing]);
  const host = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const room = useRef<CastRoomScene | null>(null);
  const latest = useRef(view);
  latest.current = view;

  useEffect(() => {
    if (!host.current || !labelHost.current) return;
    try {
      room.current = new CastRoomScene(host.current, labelHost.current, style, latest.current, setSelected);
    } catch {
      setFailed(true);
      return;
    }
    return () => {
      room.current?.dispose();
      room.current = null;
    };
  }, [style]);
  useEffect(() => room.current?.setView(view), [view]);
  useEffect(() => room.current?.select(selected), [selected]);
  const pills = labels && !far && !side;
  const plays = useMemo(() => roomPlays(shown.length, state, scene, far).plays, [shown, state, scene, far]);
  useEffect(() => room.current?.refreshLabels(), [shown, pills, plays]);

  // The address follows the controls, so a view can be shared.
  useEffect(() => {
    const next = new URLSearchParams();
    if (side) next.set("side", "1");
    else next.set("cast", castId);
    next.set("state", state);
    if (scene !== "desks") next.set("scene", scene);
    if (lightChoice) next.set("light", lightChoice);
    if (quality === "fast") next.set("quality", "fast");
    if (reducedMotion) next.set("motion", "reduced");
    if (far) next.set("view", "far");
    if (framing === "room") next.set("frame", "room");
    if (!labels) next.set("labels", "0");
    history.replaceState(null, "", `${location.pathname}?${next}`);
  }, [castId, side, state, scene, lightChoice, quality, reducedMotion, far, framing, labels]);

  const cast = casts.find((c) => c.id === castId)!;
  const stateLabel = PREVIEW_STATES.find((s) => s.id === state)!.label;
  const sceneInfo = PREVIEW_SCENES.find((s) => s.id === scene)!;
  const selectedMember = selected ? MEMBERS.find((m) => selected.endsWith(`:${m.key}`)) : undefined;
  const selectedCast = selected ? shown[Number(selected.split(":")[0])] : undefined;

  return (
    <main className="cast-preview">
      <header className="cast-preview-head">
        <div>
          <h1 className="page-title">Casting room</h1>
          <p className="page-sub">Every cast in the same sample room, in every role and state.</p>
        </div>
        <div className="cast-preview-actions">
          <Button size="sm" pressed={dark} onClick={() => (setTheme(dark ? "light" : "dark"), setLightChoice(null))}>
            Dark theme
          </Button>
          <Button size="sm" href="/">
            Back to the town
          </Button>
        </div>
      </header>

      <form className="cast-controls" aria-label="Casting room controls" onSubmit={(e) => e.preventDefault()}>
        <div className="form-row">
          <Field control="select" size="sm" label="Cast" value={castId} disabled={side} onChange={(e) => setCastId(e.currentTarget.value)}>
            {casts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Field>
          <Field control="select" size="sm" label="State" value={state} onChange={(e) => setState(e.currentTarget.value as PreviewStateId)}>
            {PREVIEW_STATES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Field>
          <Field control="select" size="sm" label="The room plays" value={scene} onChange={(e) => setScene(e.currentTarget.value as PreviewScene)}>
            {PREVIEW_SCENES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Field>
          <Field control="select" size="sm" label="Light" value={light} onChange={(e) => setLightChoice(e.currentTarget.value as PreviewLight)}>
            {PREVIEW_LIGHTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Field>
          <Field control="select" size="sm" label="Camera" value={far ? "far" : framing} onChange={(e) => (setFar(e.currentTarget.value === "far"), e.currentTarget.value !== "far" && setFraming(e.currentTarget.value as PreviewFraming))}>
            <option value="figures">The figures, close</option>
            <option value="room">The whole room</option>
            <option value="far">Town distance (far detail)</option>
          </Field>
          <Field control="select" size="sm" label="Graphics" value={quality} onChange={(e) => setQuality(e.currentTarget.value as GraphicsQuality)}>
            <option value="pretty">Pretty</option>
            <option value="fast">Fast</option>
          </Field>
        </div>
        <div className="cast-toggles">
          <Field control="checkbox" label="Side by side (every cast)" checked={side} onChange={(e) => setSide(e.currentTarget.checked)} />
          <Field control="checkbox" label="Reduced motion" checked={reducedMotion} onChange={(e) => setReducedMotion(e.currentTarget.checked)} />
          <Field control="checkbox" label="Role labels" checked={labels} onChange={(e) => setLabels(e.currentTarget.checked)} />
          <Button size="sm" onClick={() => room.current?.sendDrone()}>
            Send a ticket by drone
          </Button>
        </div>
        <div className="cast-toggles" role="group" aria-label="Camera">
          {CAMERA.map((c) => (
            <Button key={c.action} size="sm" variant="ghost" onClick={() => room.current?.moveCamera(c.action)}>
              {c.label}
            </Button>
          ))}
        </div>
      </form>

      <p className="cast-status" role="status">
        {side ? (shown.length === 1 ? `${cast.name} (the only cast so far)` : `${shown.length} casts side by side`) : cast.name} · {scene === "carry-on" ? "each its own state" : stateLabel} · {sceneInfo.label} ·{" "}
        {PREVIEW_LIGHTS.find((l) => l.id === light)!.label}
        {far ? " · town distance, far detail" : ""}
        {reducedMotion ? " · reduced motion" : ""}
        {selectedMember && selectedCast ? ` · selected: ${selectedMember.name} (${selectedCast.name})` : ""}
      </p>

      {failed ? (
        <p role="status">This browser cannot draw 3D graphics, so only the description below is available.</p>
      ) : (
        <div ref={host} className="canvas-host cast-stage" data-side={side || undefined}>
          <div ref={labelHost} className="cast-labels">
            {pills &&
              MEMBERS.map((m) => {
                const id = figureId(0, m.key);
                return (
                  <button
                    key={id}
                    type="button"
                    className="name-pill cast-pill"
                    data-figure={id}
                    aria-pressed={selected === id}
                    onClick={() => setSelected(selected === id ? null : id)}
                    onFocus={() => room.current?.hover(id)}
                    onBlur={() => room.current?.hover(null)}
                  >
                    {m.name}
                  </button>
                );
              })}
            {(side || far) &&
              plays.map((play, i) => (
                <span key={i} className="name-pill cast-room-title" data-room={i}>
                  {[side ? shown[play.cast]!.name : null, play.note].filter(Boolean).join(" · ")}
                </span>
              ))}
          </div>
        </div>
      )}

      <section className="cast-about" aria-label="What the room shows">
        <p>
          <strong>{side ? "Every cast" : cast.name}.</strong> {side ? "One room per cast, the same camera." : cast.description} {sceneInfo.hint}
          {far ? " At town distance each cast shows a block of rooms: the chosen state next to the states a viewer must tell apart from it." : ""}
        </p>
        <p className="hint">
          In the room: {MEMBERS.map((m) => m.name.toLowerCase()).join(", ")}. The lead and its three workers share the project colour; the postman and the operator
          belong to the town. Drag to turn the view, scroll to zoom, select a figure to ring it.
        </p>
      </section>
    </main>
  );
}
