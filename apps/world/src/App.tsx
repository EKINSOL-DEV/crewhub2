import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  CircleHelp,
  Compass,
  FlaskConical,
  Focus,
  Footprints,
  Grid2X2,
  Home,
  Layers2,
  Maximize,
  Minus,
  Monitor,
  Moon,
  Move,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Settings2,
  Sprout,
  Sun,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { SessionStatus } from "@crewhub/protocol";
import type { Rotation } from "@crewhub/world-engine";
import { Avatar } from "./components/Avatar";
import { Button, Card, Chip, Field } from "./components/primitives";
import { SceneBoundary } from "./components/SceneBoundary";
import { useTheme } from "./state/theme";
import {
  createSimulation,
  crew,
  definitions,
  demoSnapshot,
  scenarios,
  statusLabel,
  type CrewId,
} from "./world/data";
import type { CameraAction, PlacementTool, SceneView } from "./world/Scene";
import { sessionChip, statusIcon } from "./world/status";

const WorldCanvas = lazy(() => import("./components/WorldCanvas"));
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const NEXT_THEME = { system: "light", light: "dark", dark: "system" } as const;

export function App() {
  const { theme, cycle } = useTheme();
  const [simulation, setSimulation] = useState(createSimulation);
  const [selectedId, setSelectedId] = useState<CrewId>("moss");
  const [scenario, setScenario] = useState(0);
  const [overrides, setOverrides] = useState<
    Partial<Record<CrewId, SessionStatus>>
  >({});
  const [disconnected, setDisconnected] = useState(false),
    [paused, setPaused] = useState(false);
  const [grid, setGrid] = useState(false),
    [paths, setPaths] = useState(false),
    [cutaway, setCutaway] = useState(false);
  const [freeCamera, setFreeCamera] = useState(false),
    [lowQuality, setLowQuality] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [listView, setListView] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("view") === "list",
  );
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const [mode, setMode] = useState<SceneView["mode"]>("observe");
  const [placement, setPlacement] = useState<PlacementTool | null>(null);
  const [action, setAction] = useState<{ id: number; type: CameraAction }>({
    id: 0,
    type: "home",
  });
  const [notice, setNotice] = useState(""),
    [settings, setSettings] = useState(false),
    [mobileCrew, setMobileCrew] = useState(false);
  const [sampleResult, setSampleResult] = useState(false),
    [layoutVersion, setLayoutVersion] = useState(0);
  const [cells, setCells] = useState(() =>
    simulation.actors.map((a) => `${a.cell.x}, ${a.cell.z}`),
  );
  const help = useRef<HTMLDialogElement>(null),
    propCount = useRef(0);
  const snapshot = useMemo(() => {
    const base = demoSnapshot(scenario, disconnected);
    return {
      ...base,
      sessions: base.sessions.map((s) => {
        const status = overrides[s.id as CrewId] ?? s.status;
        return { ...s, status, activity: statusLabel[status] };
      }),
    };
  }, [scenario, disconnected, overrides]);
  const view = useMemo<SceneView>(
    () => ({
      selectedId,
      snapshot,
      grid,
      paths,
      mode,
      freeCamera,
      cutaway,
      reducedMotion,
      paused,
      lowQuality,
      placement,
    }),
    [
      selectedId,
      snapshot,
      grid,
      paths,
      mode,
      freeCamera,
      cutaway,
      reducedMotion,
      paused,
      lowQuality,
      placement,
    ],
  );
  const selectedIndex = crew.findIndex((c) => c.id === selectedId),
    selected = crew[selectedIndex]!,
    session = snapshot.sessions[selectedIndex]!;
  const counts = {
    working: snapshot.sessions.filter((s) => s.status === "working").length,
    attention: snapshot.sessions.filter((s) => s.status === "needs-input")
      .length,
    done: snapshot.sessions.filter((s) => s.status === "completed").length,
  };
  const fallback = graphicsFailed || listView;
  const camera = useCallback(
    (type: CameraAction) => setAction((a) => ({ id: a.id + 1, type })),
    [],
  );
  const select = useCallback((id: string) => {
    if (crew.some((c) => c.id === id)) {
      setSelectedId(id as CrewId);
      setSampleResult(false);
    }
  }, []);
  const notify = useCallback((message: string) => setNotice(message), []);
  const cancel = useCallback(() => {
    setMode("observe");
    setPlacement(null);
  }, []);
  const rotateProp = useCallback(
    () =>
      setPlacement((p) =>
        p ? { ...p, rotation: ((p.rotation + 1) % 4) as Rotation } : null,
      ),
    [],
  );
  const editProp = (id: string) => {
    const p = simulation.layout.props.find((p) => p.id === id);
    if (p) {
      setPlacement({
        id: p.id,
        definitionId: p.definitionId,
        rotation: p.rotation,
      });
      setMode("arrange");
    }
  };
  const addProp = (definitionId: string) => {
    setPlacement({
      id: `placed-${Date.now()}-${++propCount.current}`,
      definitionId,
      rotation: 0,
    });
    setMode("arrange");
  };
  const enterMode = (next: SceneView["mode"]) => {
    setMode(mode === next ? "observe" : next);
    setPlacement(null);
    setSettings(false);
  };
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 5500);
    return () => window.clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    // DOM oversight updates only when a cell changes; movement interpolation stays outside React.
    const id = window.setInterval(() => {
      const next = simulation.actors.map((a) => `${a.cell.x}, ${a.cell.z}`);
      setCells((old) => (old.join(";") === next.join(";") ? old : next));
    }, 500);
    return () => window.clearInterval(id);
  }, [simulation]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        help.current?.open ||
        (e.target instanceof HTMLElement &&
          (e.target.matches("input,select,textarea") ||
            e.target.isContentEditable))
      )
        return;
      if (["1", "2", "3"].includes(e.key)) select(crew[Number(e.key) - 1]!.id);
      if (e.key.toLowerCase() === "f") camera("focus");
      if (e.key.toLowerCase() === "h") {
        setFreeCamera(false);
        camera("home");
      }
      if (e.key.toLowerCase() === "g") setGrid((g) => !g);
      if (e.key.toLowerCase() === "r") rotateProp();
      if (e.key === "Escape") {
        cancel();
        setSettings(false);
        setMobileCrew(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [select, camera, cancel, rotateProp]);
  const exportLayout = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(simulation.layout, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "crewhub-greenhouse.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Room layout exported. A little world, ready to grow.");
  };
  const reset = () => {
    const next = createSimulation();
    setSimulation(next);
    setCells(next.actors.map((a) => `${a.cell.x}, ${a.cell.z}`));
    setLayoutVersion(0);
    cancel();
    camera("home");
    notify("The original room is back.");
  };
  const taskTitle =
    session.status === "needs-input"
      ? "A little direction, please"
      : session.status === "completed"
        ? "Something ready to share"
        : session.status === "idle"
          ? "Room to take a breath"
          : selected.task;

  const ThemeIcon = THEME_ICON[theme];
  const nextTheme = NEXT_THEME[theme];
  const themeLabel = `Theme: ${theme}. Switch to ${nextTheme}.`;

  return (
    <div className={`app-shell ${reducedMotion ? "reduce-motion" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to the room
      </a>
      <header className="app-header">
        <a href="#room-title" className="brand" aria-label="CrewHub home">
          <span className="brand-mark" aria-hidden="true" />
          CrewHub
        </a>
        <span className="workspace-name">
          <Sprout className="icon icon-sm" /> Your little corner
        </span>
        <div className="header-actions">
          <Chip icon={<FlaskConical className="icon" />}>Simulated room</Chip>
          <Button
            icon={<ArrowDownToLine className="icon" />}
            onClick={exportLayout}
          >
            Export room
          </Button>
          <Button
            variant="ghost"
            iconOnly
            aria-label={themeLabel}
            title={themeLabel}
            onClick={cycle}
            icon={<ThemeIcon className="icon" />}
          />
          <span className="avatar" role="img" aria-label="Local workspace">
            N
          </span>
        </div>
      </header>
      <main className="workspace" id="main-content" tabIndex={-1}>
        <nav className="side-rail" aria-label="Room tools">
          <Button
            variant="ghost"
            iconOnly
            title="Observe the room"
            aria-label="Observe the room"
            pressed={mode === "observe"}
            onClick={cancel}
            icon={<Home className="icon icon-lg" />}
          />
          <Button
            variant="ghost"
            iconOnly
            title="Arrange props"
            aria-label="Arrange props"
            pressed={mode === "arrange"}
            disabled={fallback}
            onClick={() => enterMode("arrange")}
            icon={<Box className="icon icon-lg" />}
          />
          <Button
            variant="ghost"
            iconOnly
            title="Walk an agent"
            aria-label="Walk an agent"
            pressed={mode === "walk"}
            disabled={fallback || disconnected}
            onClick={() => enterMode("walk")}
            icon={<Footprints className="icon icon-lg" />}
          />
          <span className="rail-spacer" />
          <Button
            variant="ghost"
            iconOnly
            title="Room preferences"
            aria-label="Room preferences"
            expanded={settings}
            onClick={() => setSettings(!settings)}
            icon={<Settings2 className="icon icon-lg" />}
          />
          <Button
            variant="ghost"
            iconOnly
            title="Room guide"
            aria-label="Room guide"
            onClick={() => help.current?.showModal()}
            icon={<CircleHelp className="icon icon-lg" />}
          />
        </nav>
        <section className="room-area" aria-labelledby="room-title">
          <div className="room-heading">
            <p className="eyebrow">YOUR CREW, IN THEIR ELEMENT</p>
            <h1 id="room-title">
              The Greenhouse<span>01</span>
            </h1>
            <p>A little space for big ideas.</p>
          </div>
          <Button
            className="mobile-crew-toggle"
            iconOnly
            aria-label="Toggle crew overview"
            expanded={mobileCrew}
            onClick={() => setMobileCrew(!mobileCrew)}
            icon={
              <>
                <Users className="icon icon-lg" />
                {counts.attention > 0 && (
                  <span className="badge badge-accent">{counts.attention}</span>
                )}
              </>
            }
          />
          <div className="scene-summary" aria-label="Crew status summary">
            {disconnected ? (
              <Chip.Stalled>Disconnected · last known states</Chip.Stalled>
            ) : (
              <>
                <Chip.Status
                  value="progress"
                  label={`${counts.working} in the flow`}
                  icon={statusIcon.working}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!counts.attention}
                  onClick={() => {
                    select(
                      snapshot.sessions.find((s) => s.status === "needs-input")!
                        .id,
                    );
                    setMobileCrew(true);
                  }}
                >
                  <Chip.Attention>{counts.attention} needs you</Chip.Attention>
                </Button>
                <Chip.Status
                  value="done"
                  label={`${counts.done} wrapped up`}
                  icon={statusIcon.done}
                />
              </>
            )}
          </div>
          <div className="scene-stage">
            {fallback ? (
              <div className="text-overview">
                <Sprout size={34} />
                <h2>Your crew, at a glance.</h2>
                <p>
                  {graphicsFailed
                    ? "3D is unavailable in this browser. Your crew overview is still here."
                    : "A quieter view of your little world."}
                </p>
                {crew.map((c, i) => (
                  <Card
                    as="button"
                    key={c.id}
                    type="button"
                    className="crew-card"
                    onClick={() => {
                      select(c.id);
                      setMobileCrew(true);
                    }}
                  >
                    <Avatar color={c.color} />
                    <span className="crew-card-copy">
                      <strong>{c.name}</strong>
                      {sessionChip(snapshot.sessions[i]!.status, disconnected)}
                    </span>
                    <ArrowUpRight className="icon" />
                  </Card>
                ))}
                {!graphicsFailed && (
                  <Button variant="link" onClick={() => setListView(false)}>
                    Return to the room <ArrowUpRight className="icon icon-sm" />
                  </Button>
                )}
              </div>
            ) : (
              <SceneBoundary
                onError={() => {
                  setGraphicsFailed(true);
                  cancel();
                }}
              >
                <Suspense
                  fallback={
                    <div className="room-loading">
                      <Sprout size={28} />
                      Growing your little world…
                    </div>
                  }
                >
                  <WorldCanvas
                    simulation={simulation}
                    view={view}
                    action={action}
                    onSelect={select}
                    onProp={editProp}
                    onNotice={notify}
                    onPlaced={() => setPlacement(null)}
                    onChanged={() => setLayoutVersion((v) => v + 1)}
                    onError={() => {
                      setGraphicsFailed(true);
                      cancel();
                    }}
                  />
                </Suspense>
              </SceneBoundary>
            )}
          </div>
          {!fallback && (
            <>
              <div className="room-caption">
                <span className="caption-line" />A good day to make things.
                <small>Built for a little more togetherness.</small>
              </div>
              <div
                className="camera-toolbar"
                role="toolbar"
                aria-label="Camera and display"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Layers2 className="icon" />}
                  title="Isometric home (H)"
                  aria-label="Isometric home"
                  pressed={!freeCamera}
                  onClick={() => {
                    setFreeCamera(false);
                    camera("home");
                  }}
                >
                  Isometric
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Free orbit: drag to look around"
                  aria-label="Free orbit"
                  pressed={freeCamera}
                  onClick={() => setFreeCamera(!freeCamera)}
                  icon={<Compass className="icon" />}
                />
                <span className="toolbar-divider" aria-hidden="true" />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Rotate left"
                  aria-label="Rotate left"
                  onClick={() => camera("rotate-left")}
                  icon={<RotateCcw className="icon" />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Rotate right"
                  aria-label="Rotate right"
                  onClick={() => camera("rotate-right")}
                  icon={<RotateCw className="icon" />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Zoom out"
                  aria-label="Zoom out"
                  onClick={() => camera("zoom-out")}
                  icon={<Minus className="icon" />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Zoom in"
                  aria-label="Zoom in"
                  onClick={() => camera("zoom-in")}
                  icon={<Plus className="icon" />}
                />
                <span className="toolbar-divider" aria-hidden="true" />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Show grid (G)"
                  aria-label="Show grid"
                  pressed={grid}
                  onClick={() => setGrid(!grid)}
                  icon={<Grid2X2 className="icon" />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="See-through walls"
                  aria-label="See-through walls"
                  pressed={cutaway}
                  onClick={() => setCutaway(!cutaway)}
                  icon={<Layers2 className="icon" strokeDasharray="3 2" />}
                />
              </div>
            </>
          )}
          {mode === "arrange" && !fallback && (
            <Card className="floating-panel action-tray">
              <Card.Header
                title={
                  <>
                    <Box className="icon" />
                    Make yourself at home
                  </>
                }
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label="Close arrangement tools"
                    onClick={cancel}
                    icon={<X className="icon" />}
                  />
                }
              />
              <Card.Body className="panel-stack">
                <p>
                  {placement
                    ? `Place ${definitions[placement.definitionId]!.label.toLowerCase()}. Green fits; terracotta needs more room.`
                    : "Add a little something, or select a prop to move it."}
                </p>
                <div className="prop-palette">
                  {[
                    ["plant", "Plant", "1 × 1"],
                    ["bench", "Bench", "3 × 1"],
                    ["lamp", "Lamp", "1 × 1"],
                  ].map(([id, name, size]) => (
                    <Button
                      key={id}
                      size="sm"
                      icon={<Plus className="icon icon-sm" />}
                      pressed={placement?.definitionId === id}
                      onClick={() => addProp(id!)}
                    >
                      <strong>{name}</strong>
                      <small>{size}</small>
                    </Button>
                  ))}
                </div>
                <div className="tray-row">
                  <Field
                    control="select"
                    size="sm"
                    hideLabel
                    inline
                    label="Move an existing prop"
                    id="existing-prop"
                    value={
                      simulation.layout.props.some(
                        (p) => p.id === placement?.id,
                      )
                        ? placement!.id
                        : ""
                    }
                    onChange={(e) => editProp(e.target.value)}
                  >
                    <option value="">Move an existing prop…</option>
                    {simulation.layout.props.map((p) => (
                      <option key={p.id} value={p.id}>
                        {definitions[p.definitionId]!.label} · {p.id}
                      </option>
                    ))}
                  </Field>
                  <Button
                    size="sm"
                    iconOnly
                    disabled={!placement}
                    title="Rotate prop (R)"
                    aria-label="Rotate prop"
                    onClick={rotateProp}
                    icon={<RotateCw className="icon" />}
                  />
                </div>
                <small className="hint">
                  Click to place · R to rotate · Esc to finish
                </small>
              </Card.Body>
            </Card>
          )}
          {mode === "walk" && !fallback && (
            <Card className="floating-panel action-tray">
              <Card.Header
                title={
                  <>
                    <Footprints className="icon" />A little wander with{" "}
                    {selected.name}
                  </>
                }
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label="Finish walking"
                    onClick={cancel}
                    icon={<X className="icon" />}
                  />
                }
              />
              <Card.Body className="panel-stack">
                <p>Choose an open cell. Your crew will find a clear path.</p>
                <small className="hint">
                  Or focus the room, use arrow keys, then Enter.
                </small>
              </Card.Body>
            </Card>
          )}
          {settings && (
            <Card className="floating-panel preferences">
              <Card.Header
                title="Room preferences"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label="Close preferences"
                    onClick={() => setSettings(false)}
                    icon={<X className="icon" />}
                  />
                }
              />
              <Card.Body className="panel-stack">
                <Field
                  control="checkbox"
                  label="Gentle motion only"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                />
                <Field
                  control="checkbox"
                  label="Lighter graphics"
                  checked={lowQuality}
                  onChange={(e) => setLowQuality(e.target.checked)}
                />
                <Field
                  control="checkbox"
                  label="Text-first overview"
                  checked={listView}
                  onChange={(e) => {
                    setListView(e.target.checked);
                    cancel();
                  }}
                />
                <Button
                  variant="link"
                  icon={<RotateCcw className="icon icon-sm" />}
                  onClick={reset}
                >
                  Reset room layout
                </Button>
                <p className="hint">
                  Layouts live in this visit. Export yours to keep it.
                </p>
              </Card.Body>
            </Card>
          )}
        </section>
        <aside
          className={`crew-panel ${mobileCrew ? "is-open" : ""}`}
          aria-label="Crew overview"
        >
          <div className="panel-heading">
            <h2>
              Your crew <span className="badge">03</span>
            </h2>
            <Button
              className="mobile-panel-close"
              variant="ghost"
              iconOnly
              aria-label="Close crew overview"
              onClick={() => setMobileCrew(false)}
              icon={<X className="icon icon-lg" />}
            />
          </div>
          <p className="panel-subtitle">Good company. Great possibilities.</p>
          <div className="crew-list">
            {crew.map((c, i) => (
              <Card
                as="button"
                key={c.id}
                type="button"
                className="crew-card"
                aria-pressed={selectedId === c.id}
                onClick={() => select(c.id)}
              >
                <Avatar color={c.color} />
                <span className="crew-card-copy">
                  <strong>{c.name}</strong>
                  {sessionChip(snapshot.sessions[i]!.status, disconnected)}
                </span>
                <ArrowUpRight className="icon card-arrow" />
              </Card>
            ))}
          </div>
          <Card
            as="section"
            className="agent-detail"
            aria-label={`${selected.name} details`}
          >
            <Card.Header
              headingLevel={3}
              title="A closer look"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Find in room (F)"
                  aria-label={`Find ${selected.name} in the room`}
                  disabled={fallback}
                  onClick={() => camera("focus")}
                  icon={<Focus className="icon" />}
                />
              }
            />
            <Card.Body className="panel-stack">
              <div className="agent-identity">
                <Avatar color={selected.color} size={57} />
                <div>
                  <h4>{selected.name}</h4>
                  <span>{selected.role}</span>
                </div>
              </div>
              <p className="agent-description">{selected.description}</p>
              <Card className="task-card">
                <Card.Body className="panel-stack">
                  <span className="eyebrow">SIMULATED ACTIVITY</span>
                  <p className="task-title">{taskTitle}</p>
                  <div>{sessionChip(session.status, disconnected)}</div>
                  {session.status === "needs-input" ? (
                    <Button
                      variant="primary"
                      disabled={disconnected}
                      icon={<ArrowUpRight className="icon icon-sm" />}
                      onClick={() => {
                        setOverrides((o) => ({
                          ...o,
                          [selectedId]: "working",
                        }));
                        notify(
                          `${selected.name} is back in the flow. This was a simulated reply.`,
                        );
                      }}
                    >
                      Simulate a reply
                    </Button>
                  ) : session.status === "completed" ? (
                    <Button
                      variant="primary"
                      expanded={sampleResult}
                      icon={<ArrowUpRight className="icon icon-sm" />}
                      onClick={() => setSampleResult(!sampleResult)}
                    >
                      {sampleResult
                        ? "Close sample result"
                        : "View sample result"}
                    </Button>
                  ) : (
                    <Button
                      variant="link"
                      disabled={fallback}
                      onClick={() => camera("focus")}
                    >
                      Find {selected.name} in the room{" "}
                      <Focus className="icon icon-sm" />
                    </Button>
                  )}
                  {sampleResult && session.status === "completed" && (
                    <Card className="sample-result">
                      <Card.Body>
                        <strong>A small win, ready to share.</strong>
                        <p>
                          Sample result: the room has three workstations, clear
                          walkways, and a cozy place to pause. This is demo
                          content.
                        </p>
                      </Card.Body>
                    </Card>
                  )}
                </Card.Body>
              </Card>
              <div className="session-meta">
                <span>Mock session</span>
                <span>Cell {cells[selectedIndex]}</span>
              </div>
            </Card.Body>
          </Card>
          <Card className="demo-controls">
            <Card.Header
              headingLevel={3}
              title="SET THE SCENE"
              action={<Chip>DEMO</Chip>}
            />
            <Card.Body className="panel-stack">
              <Field
                control="select"
                hideLabel
                label="Demo scenario"
                value={scenario}
                disabled={disconnected}
                onChange={(e) => {
                  setScenario(Number(e.target.value));
                  setOverrides({});
                  setSampleResult(false);
                }}
              >
                {scenarios.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </Field>
              <div className="demo-buttons">
                <Button
                  size="sm"
                  pressed={paused}
                  icon={
                    paused ? (
                      <Play className="icon icon-sm" />
                    ) : (
                      <Pause className="icon icon-sm" />
                    )
                  }
                  onClick={() => setPaused(!paused)}
                >
                  {paused ? "Resume" : "Pause"}
                </Button>
                <Button
                  size="sm"
                  pressed={disconnected}
                  icon={
                    disconnected ? (
                      <WifiOff className="icon icon-sm" />
                    ) : (
                      <Wifi className="icon icon-sm" />
                    )
                  }
                  onClick={() => setDisconnected(!disconnected)}
                >
                  {disconnected ? "Reconnect" : "Disconnect"}
                </Button>
              </div>
              <p className="hint demo-note">
                <Sprout className="icon icon-sm" />
                Just imagination. Zero model calls.
              </p>
            </Card.Body>
          </Card>
        </aside>
      </main>
      <footer className="status-bar">
        <span>
          {disconnected ? (
            <Chip.Stalled>Demo disconnected</Chip.Stalled>
          ) : (
            <Chip icon={<Wifi className="icon" />}>Local demo</Chip>
          )}
          <b>/</b>The Greenhouse
        </span>
        <span className="grid-meta">
          18 × 14 cells <b>·</b>
          {simulation.layout.props.length} props{" "}
          {layoutVersion > 0 && <em>· Layout edited</em>}
        </span>
        <Button
          variant="ghost"
          size="sm"
          pressed={paths}
          disabled={fallback}
          icon={<Footprints className="icon icon-sm" />}
          onClick={() => setPaths(!paths)}
        >
          {paths ? "Hide paths" : "Show paths"}
        </Button>
      </footer>
      <div className="toast-region" role="status" aria-live="polite">
        {notice && (
          <div className="toast">
            <span className="toast-mark" aria-hidden="true" />
            <div className="toast-body">{notice}</div>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
              icon={<X className="icon icon-sm" />}
            />
          </div>
        )}
      </div>
      <dialog ref={help} className="card-dialog" aria-labelledby="guide-title">
        <Card>
          <Card.Header
            title="Make room for your crew."
            titleId="guide-title"
            action={
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Close room guide"
                onClick={() => help.current?.close()}
                icon={<X className="icon" />}
              />
            }
          />
          <Card.Body className="panel-stack">
            <p className="eyebrow">A LITTLE FIELD GUIDE</p>
            <p>
              Select a companion to see what they are up to. The room and panel
              show the same simulated states.
            </p>
            <dl className="guide-list">
              <dt>
                <Move className="icon" />
                Explore
              </dt>
              <dd>
                Scroll to zoom. Right-drag or use two fingers to pan. Enable
                free orbit to rotate with a drag.
              </dd>
              <dt>
                <Box className="icon" />
                Arrange
              </dt>
              <dd>
                Choose a prop, then a cell. Green fits; terracotta marks a
                blocked footprint. R rotates. Paths and workstations must stay
                accessible.
              </dd>
              <dt>
                <Maximize className="icon" />
                Shortcuts
              </dt>
              <dd>
                1 / 2 / 3 select crew. F focuses. H returns home. G shows the
                grid. Escape finishes editing. In the focused canvas, arrow keys
                move the cursor and Enter confirms.
              </dd>
            </dl>
            <p className="hint guide-note">
              Everything here is a local simulation. No live sessions, messages,
              or model calls. Use the crew panel or text-first view for an
              accessible overview.
            </p>
            <Button
              variant="primary"
              icon={<ArrowUpRight className="icon" />}
              onClick={() => help.current?.close()}
            >
              Let's settle in
            </Button>
          </Card.Body>
        </Card>
      </dialog>
    </div>
  );
}
