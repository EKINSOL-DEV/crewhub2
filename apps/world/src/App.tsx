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
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Focus,
  Footprints,
  Grid2X2,
  Home,
  Layers2,
  Maximize,
  Move,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Settings2,
  Sprout,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { SessionStatus } from "@crewhub/protocol";
import type { Rotation } from "@crewhub/world-engine";
import { Avatar } from "./components/Avatar";
import { SceneBoundary } from "./components/SceneBoundary";
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

const WorldCanvas = lazy(() => import("./components/WorldCanvas"));
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function App() {
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

  return (
    <div className={`app-shell ${reducedMotion ? "reduce-motion" : ""}`}>
      <header className="app-header">
        <a href="#room-title" className="brand" aria-label="CrewHub home">
          <span className="brand-mark">
            <Layers2 size={22} strokeWidth={1.7} />
          </span>
          CrewHub<span className="brand-period">.</span>
        </a>
        <span className="header-divider" />
        <span className="workspace-name">
          <Sprout size={15} /> Your little corner
        </span>
        <div className="header-actions">
          <span className="demo-badge">
            <i /> Simulated room
          </span>
          <button className="export-button" onClick={exportLayout}>
            <ArrowDownToLine size={15} />
            <span>Export room</span>
          </button>
          <span className="user-avatar" aria-label="Local workspace">
            N
          </span>
        </div>
      </header>
      <main className="workspace">
        <nav className="side-rail" aria-label="Room tools">
          <button
            title="Observe the room"
            aria-label="Observe the room"
            aria-pressed={mode === "observe"}
            onClick={cancel}
          >
            <Home size={20} />
          </button>
          <button
            title="Arrange props"
            aria-label="Arrange props"
            aria-pressed={mode === "arrange"}
            disabled={fallback}
            onClick={() => enterMode("arrange")}
          >
            <Box size={20} />
          </button>
          <button
            title="Walk an agent"
            aria-label="Walk an agent"
            aria-pressed={mode === "walk"}
            disabled={fallback || disconnected}
            onClick={() => enterMode("walk")}
          >
            <Footprints size={20} />
          </button>
          <span className="rail-spacer" />
          <button
            title="Room preferences"
            aria-label="Room preferences"
            aria-expanded={settings}
            onClick={() => setSettings(!settings)}
          >
            <Settings2 size={19} />
          </button>
          <button
            title="Room guide"
            aria-label="Room guide"
            onClick={() => help.current?.showModal()}
          >
            <CircleHelp size={19} />
          </button>
        </nav>
        <section className="room-area" aria-labelledby="room-title">
          <div className="room-heading">
            <p className="eyebrow">YOUR CREW, IN THEIR ELEMENT</p>
            <h1 id="room-title">
              The Greenhouse<span>01</span>
            </h1>
            <p>A little space for big ideas.</p>
          </div>
          <button
            className="mobile-crew-toggle"
            aria-label="Toggle crew overview"
            aria-expanded={mobileCrew}
            onClick={() => setMobileCrew(!mobileCrew)}
          >
            <Users size={18} />
            {counts.attention > 0 && <i>{counts.attention}</i>}
          </button>
          <div className="scene-summary" aria-label="Crew status summary">
            {disconnected ? (
              <span className="summary-chip">
                <WifiOff size={13} />
                Disconnected · last known states
              </span>
            ) : (
              <>
                <span className="summary-chip">
                  <i className="status-dot" data-status="working" />
                  {counts.working} in the flow
                </span>
                <button
                  className="summary-chip attention"
                  disabled={!counts.attention}
                  onClick={() => {
                    select(
                      snapshot.sessions.find((s) => s.status === "needs-input")!
                        .id,
                    );
                    setMobileCrew(true);
                  }}
                >
                  <CircleHelp size={13} />
                  {counts.attention} needs you
                </button>
                <span className="summary-chip">
                  <Check size={13} />
                  {counts.done} wrapped up
                </span>
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
                  <button
                    key={c.id}
                    onClick={() => {
                      select(c.id);
                      setMobileCrew(true);
                    }}
                  >
                    <Avatar color={c.color} />
                    <span>
                      <strong>{c.name}</strong>
                      <small>{statusLabel[snapshot.sessions[i]!.status]}</small>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
                {!graphicsFailed && (
                  <button
                    className="text-link"
                    onClick={() => setListView(false)}
                  >
                    Return to the room <ArrowUpRight size={14} />
                  </button>
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
                <button
                  className={!freeCamera ? "active" : ""}
                  title="Isometric home (H)"
                  aria-label="Isometric home"
                  onClick={() => {
                    setFreeCamera(false);
                    camera("home");
                  }}
                >
                  <Layers2 size={17} />
                  <span>Isometric</span>
                </button>
                <button
                  className={freeCamera ? "active" : ""}
                  title="Free orbit: drag to look around"
                  aria-label="Free orbit"
                  aria-pressed={freeCamera}
                  onClick={() => setFreeCamera(!freeCamera)}
                >
                  <Compass size={18} />
                </button>
                <i />
                <button
                  title="Rotate left"
                  aria-label="Rotate left"
                  onClick={() => camera("rotate-left")}
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  title="Rotate right"
                  aria-label="Rotate right"
                  onClick={() => camera("rotate-right")}
                >
                  <RotateCw size={16} />
                </button>
                <button
                  title="Zoom out"
                  aria-label="Zoom out"
                  onClick={() => camera("zoom-out")}
                >
                  <span className="zoom-sign">−</span>
                </button>
                <button
                  title="Zoom in"
                  aria-label="Zoom in"
                  onClick={() => camera("zoom-in")}
                >
                  <Plus size={16} />
                </button>
                <i />
                <button
                  title="Show grid (G)"
                  aria-label="Show grid"
                  aria-pressed={grid}
                  onClick={() => setGrid(!grid)}
                >
                  <Grid2X2 size={17} />
                </button>
                <button
                  title="See-through walls"
                  aria-label="See-through walls"
                  aria-pressed={cutaway}
                  onClick={() => setCutaway(!cutaway)}
                >
                  <Layers2 size={17} strokeDasharray="3 2" />
                </button>
              </div>
            </>
          )}
          {mode === "arrange" && !fallback && (
            <div className="action-tray">
              <div className="tray-heading">
                <span>
                  <Box size={16} />
                  Make yourself at home
                </span>
                <button aria-label="Close arrangement tools" onClick={cancel}>
                  <X size={16} />
                </button>
              </div>
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
                  <button
                    key={id}
                    aria-pressed={placement?.definitionId === id}
                    onClick={() => addProp(id!)}
                  >
                    <Plus size={14} />
                    <strong>{name}</strong>
                    <small>{size}</small>
                  </button>
                ))}
              </div>
              <div className="tray-row">
                <label className="sr-only" htmlFor="existing-prop">
                  Move an existing prop
                </label>
                <select
                  id="existing-prop"
                  value={
                    simulation.layout.props.some((p) => p.id === placement?.id)
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
                </select>
                <button
                  disabled={!placement}
                  title="Rotate prop (R)"
                  aria-label="Rotate prop"
                  onClick={rotateProp}
                >
                  <RotateCw size={16} />
                </button>
              </div>
              <small>Click to place · R to rotate · Esc to finish</small>
            </div>
          )}
          {mode === "walk" && !fallback && (
            <div className="action-tray walk-tray">
              <div className="tray-heading">
                <span>
                  <Footprints size={16} />A little wander with {selected.name}
                </span>
                <button aria-label="Finish walking" onClick={cancel}>
                  <X size={16} />
                </button>
              </div>
              <p>Choose an open cell. Your crew will find a clear path.</p>
              <small>Or focus the room, use arrow keys, then Enter.</small>
            </div>
          )}
          {settings && (
            <div className="preferences">
              <div className="tray-heading">
                <span>Room preferences</span>
                <button
                  aria-label="Close preferences"
                  onClick={() => setSettings(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                />
                Gentle motion only
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={lowQuality}
                  onChange={(e) => setLowQuality(e.target.checked)}
                />
                Lighter graphics
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={listView}
                  onChange={(e) => {
                    setListView(e.target.checked);
                    cancel();
                  }}
                />
                Text-first overview
              </label>
              <button className="text-link" onClick={reset}>
                <RotateCcw size={14} />
                Reset room layout
              </button>
              <p>Layouts live in this visit. Export yours to keep it.</p>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={15} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </section>
        <aside
          className={`crew-panel ${mobileCrew ? "is-open" : ""}`}
          aria-label="Crew overview"
        >
          <div className="panel-heading">
            <h2>
              Your crew <span>03</span>
            </h2>
            <button
              className="mobile-panel-close"
              aria-label="Close crew overview"
              onClick={() => setMobileCrew(false)}
            >
              <X size={18} />
            </button>
            <span className="panel-spark">
              <Sprout size={20} />
            </span>
          </div>
          <p className="panel-subtitle">Good company. Great possibilities.</p>
          <div className="crew-list">
            {crew.map((c, i) => (
              <button
                key={c.id}
                className={`crew-card ${selectedId === c.id ? "selected" : ""}`}
                aria-pressed={selectedId === c.id}
                onClick={() => select(c.id)}
              >
                <Avatar color={c.color} />
                <span className="crew-card-copy">
                  <strong>{c.name}</strong>
                  <small>
                    <i
                      className="status-dot"
                      data-status={snapshot.sessions[i]!.status}
                    />
                    {statusLabel[snapshot.sessions[i]!.status]}
                  </small>
                </span>
                {snapshot.sessions[i]!.status === "needs-input" ? (
                  <span className="needs-badge">1</span>
                ) : (
                  <ArrowUpRight size={15} className="card-arrow" />
                )}
              </button>
            ))}
          </div>
          <section
            className="agent-detail"
            aria-label={`${selected.name} details`}
          >
            <div className="detail-eyebrow">
              <span>A CLOSER LOOK</span>
              <button
                title="Find in room (F)"
                aria-label={`Find ${selected.name} in the room`}
                disabled={fallback}
                onClick={() => camera("focus")}
              >
                <Focus size={16} />
              </button>
            </div>
            <div className="agent-identity">
              <Avatar color={selected.color} size={57} />
              <div>
                <h3>{selected.name}</h3>
                <span>{selected.role}</span>
              </div>
            </div>
            <p className="agent-description">{selected.description}</p>
            <div className="task-card">
              <span className="task-label">SIMULATED ACTIVITY</span>
              <h4>{taskTitle}</h4>
              <p>
                <i className="status-dot" data-status={session.status} />
                {disconnected ? "Last known: " : ""}
                {statusLabel[session.status]}
              </p>
              {session.status === "needs-input" ? (
                <button
                  className="primary-button"
                  disabled={disconnected}
                  onClick={() => {
                    setOverrides((o) => ({ ...o, [selectedId]: "working" }));
                    notify(
                      `${selected.name} is back in the flow. This was a simulated reply.`,
                    );
                  }}
                >
                  Simulate a reply <ArrowUpRight size={14} />
                </button>
              ) : session.status === "completed" ? (
                <button
                  className="primary-button"
                  aria-expanded={sampleResult}
                  onClick={() => setSampleResult(!sampleResult)}
                >
                  {sampleResult ? "Close sample result" : "View sample result"}
                  <ArrowUpRight size={14} />
                </button>
              ) : (
                <button
                  className="text-link"
                  disabled={fallback}
                  onClick={() => camera("focus")}
                >
                  Find {selected.name} in the room <Focus size={14} />
                </button>
              )}
              {sampleResult && session.status === "completed" && (
                <div className="sample-result">
                  <strong>A small win, ready to share.</strong>
                  <p>
                    Sample result: the room has three workstations, clear
                    walkways, and a cozy place to pause. This is demo content.
                  </p>
                </div>
              )}
            </div>
            <div className="session-meta">
              <span>Mock session</span>
              <span>Cell {cells[selectedIndex]}</span>
            </div>
          </section>
          <div className="demo-controls">
            <div className="demo-control-label">
              <span>SET THE SCENE</span>
              <span>DEMO</span>
            </div>
            <label className="scenario-select">
              <span className="sr-only">Demo scenario</span>
              <select
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
              </select>
              <ChevronDown size={15} />
            </label>
            <div className="demo-buttons">
              <button aria-pressed={paused} onClick={() => setPaused(!paused)}>
                {paused ? <Play size={13} /> : <Pause size={13} />}
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                aria-pressed={disconnected}
                onClick={() => setDisconnected(!disconnected)}
              >
                {disconnected ? <WifiOff size={13} /> : <Wifi size={13} />}
                {disconnected ? "Reconnect" : "Disconnect"}
              </button>
            </div>
            <p>
              <Sprout size={12} />
              Just imagination. Zero model calls.
            </p>
          </div>
        </aside>
      </main>
      <footer className="status-bar">
        <span>
          <i className={`connection-dot ${disconnected ? "offline" : ""}`} />
          {disconnected ? "Demo disconnected" : "Local demo"}
          <b>/</b>The Greenhouse
        </span>
        <span className="grid-meta">
          18 × 14 cells <b>·</b>
          {simulation.layout.props.length} props{" "}
          {layoutVersion > 0 && <em>· Layout edited</em>}
        </span>
        <button
          aria-pressed={paths}
          disabled={fallback}
          onClick={() => setPaths(!paths)}
        >
          <Footprints size={12} />
          {paths ? "Hide paths" : "Show paths"}
        </button>
      </footer>
      <dialog ref={help} className="help-dialog">
        <button
          className="dialog-close"
          aria-label="Close room guide"
          onClick={() => help.current?.close()}
        >
          <X size={20} />
        </button>
        <Sprout size={30} />
        <p className="eyebrow">A LITTLE FIELD GUIDE</p>
        <h2>Make room for your crew.</h2>
        <p>
          Select a companion to see what they are up to. The room and panel show
          the same simulated states.
        </p>
        <dl>
          <dt>
            <Move size={16} />
            Explore
          </dt>
          <dd>
            Scroll to zoom. Right-drag or use two fingers to pan. Enable free
            orbit to rotate with a drag.
          </dd>
          <dt>
            <Box size={16} />
            Arrange
          </dt>
          <dd>
            Choose a prop, then a cell. Green fits; terracotta marks a blocked
            footprint. R rotates. Paths and workstations must stay accessible.
          </dd>
          <dt>
            <Maximize size={16} />
            Shortcuts
          </dt>
          <dd>
            1 / 2 / 3 select crew. F focuses. H returns home. G shows the grid.
            Escape finishes editing. In the focused canvas, arrow keys move the
            cursor and Enter confirms.
          </dd>
        </dl>
        <div className="guide-note">
          Everything here is a local simulation. No live sessions, messages, or
          model calls. Use the crew panel or text-first view for an accessible
          overview.
        </div>
        <button
          className="primary-button"
          onClick={() => help.current?.close()}
        >
          Let's settle in <ArrowUpRight size={15} />
        </button>
      </dialog>
    </div>
  );
}
