import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type Ref } from "react";
import { ArrowLeft, FlaskConical, Hammer, MessageCircle, Minus, Monitor, Moon, Pause, Plus, RotateCcw, RotateCw, Scan, Settings, Sprout, Sun, Tags, X } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describeTownDocument, ruleProps, type AgentPlacement, type PlaybackControls, type PlaybackSpeed, type RoleId, type RoomKind, type TextLine, type WorldModel } from "@crewhub/world-model";
import type { PropModel } from "@crewhub/world-engine";
import { Bubbles } from "./components/bubbles/Bubbles";
import { TownSettings } from "./components/TownSettings";
import { IconSprite } from "./components/Icon";
import { Button, Card, Chip, Field } from "./components/primitives";
import { SceneBoundary } from "./components/SceneBoundary";
import type { Selection } from "./components/WorldCanvas";
import { createChatQueryClient, useChatEvents, useChatNavigation, useChatView } from "./state/chat";
import { useAmbient } from "./state/ambient";
import { toggleDetails, useDetails } from "./state/details";
import { toggleFps } from "./state/fps";
import { readRoleOverrides, writeRoleOverrides } from "./state/roleOverrides";
import { useBuildMode } from "./state/build";
import { useDark, useTheme } from "./state/theme";
import { townRuntime, useTown } from "./state/town";
import type { TownLayer } from "./world/propLayer";
import { useWorld, worldRuntime } from "./state/world";
import { buildingTemplate } from "./world/buildingTemplate";
import type { Pick } from "./world/buildingView";
import { firstRoom, roomName, roomNeighbor, roomSummary } from "./world/interiorLayout";
import { DirectorLog } from "./components/DirectorLog";
import { PresenceSettings } from "./components/PresenceSettings";
import { WhereForm } from "./components/WhereForm";
import { useDirectorFeed } from "./state/director";
import type { CameraAction } from "./world/TownScene";
import { countsLine, laneWords, mmss, moveFocus, TOWN_CAPACITY } from "./world/townLayout";

const WorldCanvas = lazy(() => import("./components/WorldCanvas"));
// Build mode and the prop editor are not needed for the first frame: they load when first opened.
const BuildPanel = lazy(() => import("./components/BuildPanel").then(({ BuildPanel }) => ({ default: BuildPanel })));
const PropEditor = lazy(() => import("./components/PropEditor").then(({ PropEditor }) => ({ default: PropEditor })));

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const NEXT_THEME = { system: "light", light: "dark", dark: "system" } as const;

/* Below this width the chat is loops' narrow mode: a "Agent chats" menu in the corner and the chat as a full-screen dialog. */
const NARROW = "(max-width: 899px)";
const useNarrow = () =>
  useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(NARROW);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    () => window.matchMedia(NARROW).matches,
  );

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches("input, select, textarea") || target.isContentEditable);

/** A callback whose identity never changes but which always calls the latest `fn`, so memoised chrome skips renders. */
function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback((...args: A) => latest.current(...args), []);
}

export function App() {
  const [queryClient] = useState(createChatQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <World />
    </QueryClientProvider>
  );
}

function World() {
  const { model, text, playback } = useWorld();
  const narrow = useNarrow();
  const dockHeight = useDockHeight();
  const { theme, cycle } = useTheme();
  useDirectorFeed();
  const [entered, setEntered] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const [ringVisible, setRingVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [action, setAction] = useState<{ id: number; type: CameraAction }>({ id: 0, type: "home" });
  const [room, setRoom] = useState<RoomKind | null>(null);
  const [zoomed, setZoomed] = useState<RoomKind | null>(null);
  const [selection, setSelection] = useState<Selection>({ hover: null, selected: null });
  const [overrides, setOverrides] = useState<Record<string, RoleId>>(readRoleOverrides);
  const ambient = useAmbient();
  const details = useDetails();
  useEffect(() => {
    writeRoleOverrides(overrides);
    worldRuntime().setRoleOverrides(overrides);
  }, [overrides]);
  const town = useTown();
  const dark = useDark();
  const [editing, setEditing] = useState<{ prop: PropModel | null } | null>(null);
  useEffect(() => townRuntime().onAnnounce(setAnnouncement), []);
  const returnFocus = useRef<HTMLElement | null>(null);
  const textRegion = useRef<HTMLElement>(null),
    settingsCard = useRef<HTMLDivElement>(null);

  const buildings = model.buildings.slice(0, TOWN_CAPACITY);
  const inside = buildings.find((b) => b.slug === entered) ?? null;
  const camera = useCallback((type: CameraAction) => setAction((a) => ({ id: a.id + 1, type })), []);
  const build = useBuildMode(town, inside, room, setAnnouncement);
  const rules = useMemo(() => ruleProps(model, town.doc.rules), [model, town.doc.rules]);
  const townLayer = useMemo<TownLayer>(
    () => ({
      doc: town.doc,
      catalogue: town.catalogue,
      definitions: town.definitions,
      rules,
      invalid: town.invalid,
      fresh: townRuntime().fresh,
      build: build.state.on ? { on: true, ghost: build.ghost, selected: build.state.selected, theme: "day" } : null,
    }),
    // The ghost object is rebuilt each render; its fields decide.
    [town, rules, build.state.on, build.state.selected, JSON.stringify(build.ghost)],
  );
  const textLines = useMemo(
    () => [...text, ...describeTownDocument(town.doc, town.catalogue, { ruleProps: rules, invalidRequests: town.invalid })],
    [text, town.doc, town.catalogue, rules, town.invalid],
  );
  const undo = useCallback(() => {
    townRuntime().undo();
    setAnnouncement("Undone.");
  }, []);
  const redo = useCallback(() => {
    townRuntime().redo();
    setAnnouncement("Redone.");
  }, []);
  const requestProp = useCallback((thing: string) => {
    const demo = worldRuntime().demo;
    if (!demo) {
      const text = "Requesting a prop needs the demo script; the stress fixture has none.";
      setAnnouncement(text);
      return text;
    }
    const { title } = demo.createPropRequest(thing);
    const text = `Requested "${title}". The ticket appears in the CrewHub building, an agent posts the prop, and a person moves it to Done.`;
    setAnnouncement(text);
    return text;
  }, []);
  const saveProp = useCallback(
    (prop: PropModel) => {
      const result = townRuntime().edit({ type: "add-user-prop", prop });
      if (!result.ok) return result.error;
      setEditing(null);
      build.choose(prop.id);
      setAnnouncement(`${prop.name} saved under Mine and chosen for placing.`);
      return null;
    },
    [build],
  );

  const describe = useCallback(
    (index: number) => {
      const b = buildings[index];
      if (!b) return "";
      if (b.archived) return `${b.name} (${b.key}), archived. ${countsLine(b.counts)}. Enter to look inside.`;
      const lead = b.agents.find((a) => a.key === b.lead.id && a.presence === "real");
      return `${b.name} (${b.key}). ${countsLine(b.counts)}. Lead ${b.lead.displayName}, ${lead ? laneWords(lead.laneStatus, model.freshness) : "not in the building"}. Enter to go inside.`;
    },
    [buildings, model.freshness],
  );
  const enter = useCallback(
    (slug: string) => {
      const index = buildings.findIndex((b) => b.slug === slug);
      const b = buildings[index];
      if (!b) return;
      setEntered(slug);
      setFocused(index);
      setRoom(null);
      setZoomed(null);
      setSelection({ hover: null, selected: null });
      setAnnouncement(`Inside ${b.name} (${b.key}). ${b.agents.filter((a) => a.presence === "real").length} agents here. Escape or Backspace returns to the town.`);
    },
    [buildings],
  );
  const back = useCallback(() => {
    setEntered(null);
    setRoom(null);
    setZoomed(null);
    setSelection({ hover: null, selected: null });
    setAnnouncement(`The town. ${describe(focused)}`);
  }, [describe, focused]);
  const summary = useCallback(
    (kind: RoomKind) => (inside ? roomSummary(inside, kind, (a: AgentPlacement) => laneWords(a.laneStatus, model.freshness)) : ""),
    [inside, model.freshness],
  );
  const focusRoom = useCallback(
    (kind: RoomKind, zoom: boolean) => {
      setRoom(kind);
      if (zoom) setZoomed(kind);
      setAnnouncement(`${zoom ? "Zoomed to the " : ""}${summary(kind)}${zoom ? " Escape goes back to the building." : ""}`);
    },
    [summary],
  );
  const pick = useCallback(
    (target: Pick | null, hover: boolean) => {
      if (target?.kind === "prop") target = null;
      if (hover) {
        setSelection((s) => ({ ...s, hover: target }));
        return;
      }
      if (target?.kind === "room") {
        focusRoom(target.room, true);
        return;
      }
      setSelection((s) => ({ hover: s.hover, selected: target && JSON.stringify(target) !== JSON.stringify(s.selected) ? target : null }));
    },
    [focusRoom],
  );

  const openText = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTextOpen(true);
  }, []);
  const closeText = useCallback(() => {
    setTextOpen(false);
    returnFocus.current?.focus();
  }, []);
  const openSettings = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    returnFocus.current?.focus();
  }, []);
  useEffect(() => {
    if (textOpen) textRegion.current?.focus();
  }, [textOpen]);
  useChatEvents();
  useChatView(inside?.lead.id ?? null);
  useChatNavigation(openSettings);
  useEffect(() => {
    if (settingsOpen) settingsCard.current?.querySelector<HTMLElement>("button")?.focus();
  }, [settingsOpen]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);

  // Keys that work anywhere outside a text field: T, Escape and Backspace, and the camera keys.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      // Undo and redo of layout edits while build mode is on.
      if (build.state.on && (e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
        e.preventDefault();
        if (e.key.toLowerCase() === "y" || e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (editing) {
        if (e.key === "Escape") setEditing(null);
        return;
      }
      if (e.key.toLowerCase() === "b" && !graphicsFailed) {
        e.preventDefault();
        build.toggle();
        return;
      }
      // Escape closes the innermost thing first: Settings, then build mode (its drag, selection, chosen prop, then the
      // mode itself), then the text view, the selection, the zoomed room and the building.
      if (e.key === "Escape" && settingsOpen) {
        e.preventDefault();
        closeSettings();
        return;
      }
      if (build.key(e)) {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape" && build.state.on) {
        e.preventDefault();
        build.toggle();
        return;
      }
      if (e.key === "Escape") {
        if (textOpen) closeText();
        else if (selection.selected) setSelection((s) => ({ ...s, selected: null }));
        else if (zoomed) {
          setZoomed(null);
          setAnnouncement(`Inside ${inside?.name ?? "the building"}. Arrow keys move between rooms.`);
        } else if (entered) back();
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === "Backspace" && entered) {
        e.preventDefault();
        back();
        return;
      }
      if (e.key.toLowerCase() === "d" && !graphicsFailed) {
        e.preventDefault();
        setAnnouncement(toggleDetails() ? "Details on: every label shows." : "Details off: names and one bubble per robot.");
        return;
      }
      if (e.key.toLowerCase() === "f" && !graphicsFailed) {
        e.preventDefault();
        setAnnouncement(toggleFps() ? "Frame rate overlay on." : "Frame rate overlay off.");
        return;
      }
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        if (textOpen) closeText();
        else openText();
        return;
      }
      if (graphicsFailed || textOpen) return;
      const cameraKeys: Record<string, CameraAction> = { "+": "zoom-in", "=": "zoom-in", "-": "zoom-out", "[": "rotate-left", "]": "rotate-right", h: "home", H: "home" };
      const cameraAction = cameraKeys[e.key];
      if (cameraAction) {
        e.preventDefault();
        camera(cameraAction);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [back, build, camera, closeSettings, closeText, editing, entered, graphicsFailed, inside, openText, redo, selection.selected, settingsOpen, textOpen, undo, zoomed]);

  // Arrow keys and Enter move the focus ring between plots while the scene has keyboard focus.
  const sceneKey = (e: ReactKeyboardEvent) => {
    if (typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
    // Build mode moves the chosen or selected prop with the arrow keys (the window listener handles them).
    if (build.state.on && inside && (build.state.propId || build.state.selected)) return;
    if (inside) {
      // Inside a building: arrow keys move the focus ring between rooms, Enter zooms to the focused room.
      const onCanvas = e.target === e.currentTarget.querySelector("canvas");
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const template = buildingTemplate(inside);
        focusRoom(room ? roomNeighbor(template, room, e.key) : firstRoom(template), false);
      } else if (e.key === "Enter" && onCanvas) {
        e.preventDefault();
        focusRoom(room ?? firstRoom(buildingTemplate(inside)), true);
      }
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const next = ringVisible ? moveFocus(focused, e.key, buildings.length) : focused;
      setFocused(next);
      setRingVisible(true);
      setAnnouncement(describe(next));
    }
    if (e.key === "Enter" && e.target === e.currentTarget.querySelector("canvas")) {
      e.preventDefault();
      const b = buildings[focused];
      if (b) enter(b.slug);
    }
  };
  const hover = useCallback((index: number | null) => {
    if (index === null) return;
    setFocused(index);
    setRingVisible(true);
  }, []);

  const demo = model.mode === "demo";
  const onBack = useStable(back);

  return (
    <div
      className="world-shell"
      data-dock={dockHeight === null ? undefined : ""}
      style={dockHeight === null ? undefined : ({ "--dock-height": `${dockHeight}px` } as CSSProperties)}
    >
      <IconSprite />
      <a className="skip-link" href="#text-view" onClick={(e) => (e.preventDefault(), openText())}>
        Open the text view (T)
      </a>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <main className="world-stage" onKeyDown={sceneKey} aria-label="CrewHub World">
        {graphicsFailed ? null : (
          <SceneBoundary onError={() => setGraphicsFailed(true)}>
            <Suspense
              fallback={
                <div className="room-loading">
                  <Sprout size={28} aria-hidden="true" />
                  Laying out the town…
                </div>
              }
            >
              <WorldCanvas
                model={model}
                entered={entered}
                focused={focused}
                ringVisible={ringVisible}
                room={room}
                zoomed={zoomed}
                selection={selection}
                onPick={pick}
                reducedMotion={reducedMotion}
                ambient={ambient}
                details={details}
                action={action}
                onEnter={enter}
                onHover={hover}
                onError={() => setGraphicsFailed(true)}
                town={townLayer}
                onBuild={build.pointer}
              />
            </Suspense>
          </SceneBoundary>
        )}
      </main>

      <Corner demo={demo} graphicsFailed={graphicsFailed} insideName={inside?.name ?? null} zoomedName={inside && zoomed ? roomName(inside, zoomed) : null} onBack={onBack} />

      <CornerTools theme={theme} cycle={cycle} details={details} buildOn={build.state.on} toggleBuild={build.toggle} settingsOpen={settingsOpen} openSettings={openSettings} closeSettings={closeSettings} graphicsFailed={graphicsFailed} />

      {settingsOpen && (
        <Card ref={settingsCard} className="world-sheet settings-sheet" role="dialog" aria-labelledby="settings-title">
          <Card.Header
            title="Settings"
            titleId="settings-title"
            action={<Button variant="ghost" size="sm" iconOnly aria-label="Close settings" icon={<X className="icon" aria-hidden="true" />} onClick={closeSettings} />}
          />
          <Card.Body>
            <RoleSettings model={model} overrides={overrides} onChange={setOverrides} />
            <TownSettings town={town} />
            <p className="sign-muted">Agent settings live in the crewhub-loops web app; the demo has none.</p>
            <PresenceSettings reducedMotion={reducedMotion} />
          </Card.Body>
        </Card>
      )}

      {build.state.on && !graphicsFailed && (
        <Suspense fallback={null}>
          <BuildPanel
            build={build}
            town={town}
            inside={inside}
            demo={demo}
            onClose={build.toggle}
            onUndo={undo}
            onRedo={redo}
            onEdit={(propId) => setEditing({ prop: propId ? (town.catalogue.get(propId)?.model ?? null) : null })}
            onRequest={requestProp}
          />
        </Suspense>
      )}
      {editing && (
        <Suspense fallback={null}>
          <PropEditor
            initial={editing.prop}
            takenIds={town.catalogue.entries.map((e) => e.id)}
            theme={dark ? "lamplight" : "day"}
            onSave={saveProp}
            onClose={() => setEditing(null)}
          />
        </Suspense>
      )}

      {!graphicsFailed && <CameraToolbar camera={camera} />}

      <ChatCorner narrow={narrow} demo={demo} />

      {playback && <PlaybackBar playback={playback} />}

      {(textOpen || graphicsFailed) && <TextView ref={textRegion} lines={textLines} fallback={graphicsFailed} onClose={graphicsFailed ? null : closeText} />}
    </div>
  );
}

/* The copied dock renders itself into <body>. Its height goes on the shell (`--dock-height`, `data-dock`) so the demo note and
   the camera toolbar can stack above it; without a dock (the narrow "Agent chats" menu) they keep their own places. */
function useDockHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    let dock: Element | null = null;
    const measure = () => setHeight(dock ? dock.getBoundingClientRect().height : null);
    const resize = new ResizeObserver(measure);
    const find = () => {
      const found = document.querySelector("body > aside.dock");
      if (found === dock) return;
      if (dock) resize.unobserve(dock);
      dock = found;
      if (dock) resize.observe(dock);
      measure();
    };
    const children = new MutationObserver(find);
    children.observe(document.body, { childList: true });
    find();
    return () => {
      children.disconnect();
      resize.disconnect();
    };
  }, []);
  return height;
}


const ROLE_CHOICES: readonly RoleId[] = ["lead", "worker", "analyst", "design"];

/** Role overrides (plan 4.2): one select per agent; "from the rules" removes the override. */
function RoleSettings({ model, overrides, onChange }: { model: WorldModel; overrides: Record<string, RoleId>; onChange: (next: Record<string, RoleId>) => void }) {
  const agents = new Map<string, AgentPlacement>();
  for (const a of [...model.buildings.flatMap((b) => b.agents), ...model.townHall]) if (!agents.has(a.key)) agents.set(a.key, a);
  const list = [...agents.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (!list.length) return <p className="sign-muted">No agents yet.</p>;
  return (
    <fieldset className="role-settings">
      <legend className="label">Roles</legend>
      <p className="hint">A role decides an agent's room. Kept in this browser only.</p>
      <ul>
        {list.map((a) => (
          <li key={a.key}>
            <Field
              control="select"
              size="sm"
              label={a.displayName}
              inline
              value={overrides[a.key] ?? ""}
              onChange={(e) => {
                const next = { ...overrides };
                const value = e.currentTarget.value as RoleId | "";
                if (value) next[a.key] = value;
                else delete next[a.key];
                onChange(next);
              }}
            >
              <option value="">{a.roleSource === "override" ? "From the rules" : `${a.role}, ${a.roleSource === "fact" ? "a fact" : "from its name"}`}</option>
              {ROLE_CHOICES.map((role) => (
                <option key={role} value={role}>
                  {role}, set by you
                </option>
              ))}
            </Field>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

const SPEEDS: readonly { speed: PlaybackSpeed; label: string }[] = [
  { speed: 0, label: "Pause" },
  { speed: 1, label: "1x" },
  { speed: 4, label: "4x" },
  { speed: 16, label: "16x" },
];

/* The chrome around the scene, memoised: the world model changes many times a second under load, and none of these show
   it, so they render only when their own props change. */
const Corner = memo(function Corner({ demo, graphicsFailed, insideName, zoomedName, onBack }: { demo: boolean; graphicsFailed: boolean; insideName: string | null; zoomedName: string | null; onBack: () => void }) {
  return (
    <header className="world-corner world-corner-left">
      <div className="world-brand">
        <span className="brand-mark" aria-hidden="true" />
        <strong>CrewHub World</strong>
        {demo && (
          <Chip className="demo-chip" icon={<FlaskConical className="icon" aria-hidden="true" />} title="Demo: scripted data" aria-label="Demo: scripted data">
            <span className="demo-word">Demo</span>
          </Chip>
        )}
      </div>
      {!graphicsFailed && (
        <nav className="world-breadcrumb" aria-label="Where you are">
          {insideName !== null ? (
            <>
              <Button size="sm" icon={<ArrowLeft className="icon" aria-hidden="true" />} onClick={onBack} kbd="Esc">
                Town
              </Button>
              <span className="crumb-current" aria-current={zoomedName ? undefined : "location"}>
                {insideName}
              </span>
              {zoomedName && (
                <span className="crumb-current" aria-current="location">
                  {zoomedName}
                </span>
              )}
            </>
          ) : (
            <span className="crumb-current" aria-current="location">
              Town
            </span>
          )}
        </nav>
      )}
    </header>
  );
});

const CornerTools = memo(function CornerTools(props: {
  theme: keyof typeof THEME_ICON;
  cycle: () => void;
  details: boolean;
  buildOn: boolean;
  toggleBuild: () => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  graphicsFailed: boolean;
}) {
  const { theme, cycle, details, buildOn, toggleBuild, settingsOpen, openSettings, closeSettings, graphicsFailed } = props;
  const ThemeIcon = THEME_ICON[theme];
  return (
    <div className="world-corner world-corner-right">
      <Button variant="ghost" iconOnly aria-label={`Theme: ${theme}. Switch to ${NEXT_THEME[theme]}.`} title={`Theme: ${theme}`} icon={<ThemeIcon className="icon" aria-hidden="true" />} onClick={cycle} />
      {!graphicsFailed && (
        <Button
          variant="ghost"
          iconOnly
          aria-label="Details (D)"
          title={details ? "Details on: every label (D)" : "Details: show every label (D)"}
          pressed={details}
          icon={<Tags className="icon" aria-hidden="true" />}
          onClick={() => void toggleDetails()}
        />
      )}
      {!graphicsFailed && (
        <Button
          variant="ghost"
          iconOnly
          aria-label={buildOn ? "Leave build mode (B)" : "Build mode (B)"}
          title={buildOn ? "Leave build mode (B)" : "Build mode (B)"}
          pressed={buildOn}
          icon={<Hammer className="icon" aria-hidden="true" />}
          onClick={toggleBuild}
        />
      )}
      <Button variant="ghost" iconOnly aria-label="Settings" title="Settings" expanded={settingsOpen} icon={<Settings className="icon" aria-hidden="true" />} onClick={settingsOpen ? closeSettings : openSettings} />
    </div>
  );
});

const CameraToolbar = memo(function CameraToolbar({ camera }: { camera: (type: CameraAction) => void }) {
  return (
    <div className="camera-toolbar" role="toolbar" aria-label="Camera">
      <Button variant="ghost" size="sm" iconOnly aria-label="Zoom in" title="Zoom in (+)" icon={<Plus className="icon" aria-hidden="true" />} onClick={() => camera("zoom-in")} />
      <Button variant="ghost" size="sm" iconOnly aria-label="Zoom out" title="Zoom out (−)" icon={<Minus className="icon" aria-hidden="true" />} onClick={() => camera("zoom-out")} />
      <Button variant="ghost" size="sm" iconOnly aria-label="Rotate left" title="Rotate left ([)" icon={<RotateCcw className="icon" aria-hidden="true" />} onClick={() => camera("rotate-left")} />
      <Button variant="ghost" size="sm" iconOnly aria-label="Rotate right" title="Rotate right (])" icon={<RotateCw className="icon" aria-hidden="true" />} onClick={() => camera("rotate-right")} />
      <Button variant="ghost" size="sm" iconOnly aria-label="Home view" title="Home view (H)" icon={<Scan className="icon" aria-hidden="true" />} onClick={() => camera("home")} />
    </div>
  );
});

const ChatCorner = memo(function ChatCorner({ narrow, demo }: { narrow: boolean; demo: boolean }) {
  return (
    <div className="world-chat">
      <Bubbles narrow={narrow} />
      {demo && (
        <Chip className="demo-chat-chip" icon={<MessageCircle className="icon" aria-hidden="true" />}>
          Demo: replies are scripted
        </Chip>
      )}
    </div>
  );
});

function usePlayback(playback: PlaybackControls) {
  // A snapshot string, so useSyncExternalStore sees a stable value between changes.
  const snapshot = useSyncExternalStore(
    (listener) => playback.onChange(listener),
    () => `${Math.floor(playback.positionMs() / 1000)}|${playback.speed()}|${playback.loop()}`,
  );
  const [seconds, speed, loop] = snapshot.split("|").map(Number) as [number, number, number];
  return { positionMs: seconds * 1000, speed: speed as PlaybackSpeed, loop };
}

const PlaybackBar = memo(function PlaybackBar({ playback }: { playback: PlaybackControls }) {
  const { positionMs, speed, loop } = usePlayback(playback);
  const position = mmss(positionMs),
    duration = mmss(playback.durationMs);
  return (
    <section className="playback-bar" aria-label="Demo playback">
      <div className="segmented playback-speeds" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <Button key={s.speed} size="sm" className="btn-segmented" pressed={speed === s.speed} aria-label={s.speed ? `Play at ${s.label}` : "Pause"} onClick={() => playback.setSpeed(s.speed)}>
            {s.speed ? s.label : <Pause className="icon" aria-hidden="true" />}
          </Button>
        ))}
      </div>
      <input
        className="playback-scrub"
        type="range"
        min={0}
        max={playback.durationMs}
        step={1000}
        value={positionMs}
        aria-label="Position in the demo script"
        aria-valuetext={`${position} of ${duration}`}
        onChange={(e) => playback.seek(Number(e.currentTarget.value))}
      />
      <span className="playback-time">
        {position}
        <span className="playback-duration"> / {duration}</span>
      </span>
      <span className="playback-loop" title="How many times the script has looped">
        loop {loop}
      </span>
    </section>
  );
});

const KIND_WORD: Record<TextLine["kind"], string> = { fact: "fact", inference: "inference", cosmetic: "cosmetic", demo: "demo" };

function TextView({ lines, fallback, onClose, ref }: { lines: TextLine[]; fallback: boolean; onClose: (() => void) | null; ref: Ref<HTMLElement> }) {
  const sections = new Map<string, TextLine[]>();
  for (const line of lines) sections.set(line.section, [...(sections.get(line.section) ?? []), line]);
  return (
    <Card as="section" ref={ref} id="text-view" className={`world-sheet text-sheet${fallback ? " fallback" : ""}`} role="region" aria-labelledby="text-view-title" tabIndex={-1}>
      <Card.Header
        title="Text view of the world"
        titleId="text-view-title"
        action={onClose ? <Button variant="ghost" size="sm" iconOnly aria-label="Close the text view" icon={<X className="icon" aria-hidden="true" />} onClick={onClose} /> : undefined}
      />
      <Card.Body>
        {fallback && <p className="text-note">3D graphics are not available here, so the world is shown as text.</p>}
        <WhereForm />
        {[...sections].map(([section, items]) => (
          <section key={section} className="text-section">
            <h3>{section}</h3>
            <ul>
              {items.map((line, i) => (
                <li key={i}>
                  <span className="text-kind" data-kind={line.kind}>
                    {KIND_WORD[line.kind]}
                  </span>
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <DirectorLog />
      </Card.Body>
    </Card>
  );
}
