import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type Ref } from "react";
import { ArrowLeft, FlaskConical, MessageCircle, Minus, Monitor, Moon, Pause, Plus, RotateCcw, RotateCw, Scan, Settings, Sprout, Sun, X } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { PlaybackControls, PlaybackSpeed, TextLine } from "@crewhub/world-model";
import { Bubbles } from "./components/bubbles/Bubbles";
import { IconSprite } from "./components/Icon";
import { Button, Card, Chip } from "./components/primitives";
import { SceneBoundary } from "./components/SceneBoundary";
import { createChatQueryClient, useChatEvents, useChatNavigation, useChatView } from "./state/chat";
import { useTheme } from "./state/theme";
import { useWorld } from "./state/world";
import type { CameraAction } from "./world/TownScene";
import { countsLine, laneWords, mmss, moveFocus, TOWN_CAPACITY } from "./world/townLayout";

const WorldCanvas = lazy(() => import("./components/WorldCanvas"));

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
  const [entered, setEntered] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const [ringVisible, setRingVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [action, setAction] = useState<{ id: number; type: CameraAction }>({ id: 0, type: "home" });
  const returnFocus = useRef<HTMLElement | null>(null);
  const textRegion = useRef<HTMLElement>(null),
    settingsCard = useRef<HTMLDivElement>(null);

  const buildings = model.buildings.slice(0, TOWN_CAPACITY);
  const inside = buildings.find((b) => b.slug === entered) ?? null;
  const camera = useCallback((type: CameraAction) => setAction((a) => ({ id: a.id + 1, type })), []);

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
      setAnnouncement(`Inside ${b.name} (${b.key}). ${b.agents.filter((a) => a.presence === "real").length} agents here. Escape or Backspace returns to the town.`);
    },
    [buildings],
  );
  const back = useCallback(() => {
    setEntered(null);
    setAnnouncement(`The town. ${describe(focused)}`);
  }, [describe, focused]);

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
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (e.key === "Escape") {
        if (settingsOpen) closeSettings();
        else if (textOpen) closeText();
        else if (entered) back();
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === "Backspace" && entered) {
        e.preventDefault();
        back();
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
  }, [back, camera, closeSettings, closeText, entered, graphicsFailed, openText, settingsOpen, textOpen]);

  // Arrow keys and Enter move the focus ring between plots while the scene has keyboard focus.
  const sceneKey = (e: ReactKeyboardEvent) => {
    if (entered || typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
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

  const ThemeIcon = THEME_ICON[theme];
  const demo = model.mode === "demo";

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
                reducedMotion={reducedMotion}
                action={action}
                onEnter={enter}
                onHover={hover}
                onError={() => setGraphicsFailed(true)}
              />
            </Suspense>
          </SceneBoundary>
        )}
      </main>

      <header className="world-corner world-corner-left">
        <div className="world-brand">
          <span className="brand-mark" aria-hidden="true" />
          <strong>CrewHub World</strong>
          {demo && (
            <Chip className="demo-chip" icon={<FlaskConical className="icon" aria-hidden="true" />} title="Demo: scripted data" aria-label="Demo: scripted data">
              Demo
            </Chip>
          )}
        </div>
        {!graphicsFailed && (
          <nav className="world-breadcrumb" aria-label="Where you are">
            {inside ? (
              <>
                <Button size="sm" icon={<ArrowLeft className="icon" aria-hidden="true" />} onClick={back} kbd="Esc">
                  Town
                </Button>
                <span className="crumb-current" aria-current="location">
                  {inside.name}
                </span>
              </>
            ) : (
              <span className="crumb-current" aria-current="location">
                Town
              </span>
            )}
          </nav>
        )}
      </header>

      <div className="world-corner world-corner-right">
        <Button variant="ghost" iconOnly aria-label={`Theme: ${theme}. Switch to ${NEXT_THEME[theme]}.`} title={`Theme: ${theme}`} icon={<ThemeIcon className="icon" aria-hidden="true" />} onClick={cycle} />
        <Button variant="ghost" iconOnly aria-label="Settings" title="Settings" expanded={settingsOpen} icon={<Settings className="icon" aria-hidden="true" />} onClick={settingsOpen ? closeSettings : openSettings} />
      </div>

      {settingsOpen && (
        <Card ref={settingsCard} className="world-sheet settings-sheet" role="dialog" aria-labelledby="settings-title">
          <Card.Header
            title="Settings"
            titleId="settings-title"
            action={<Button variant="ghost" size="sm" iconOnly aria-label="Close settings" icon={<X className="icon" aria-hidden="true" />} onClick={closeSettings} />}
          />
          <Card.Body>
            <p className="sign-muted">Nothing to set yet. Agent settings live in the crewhub-loops web app; the demo has none.</p>
          </Card.Body>
        </Card>
      )}

      {!graphicsFailed && (
        <div className="camera-toolbar" role="toolbar" aria-label="Camera">
          <Button variant="ghost" size="sm" iconOnly aria-label="Zoom in" title="Zoom in (+)" icon={<Plus className="icon" aria-hidden="true" />} onClick={() => camera("zoom-in")} />
          <Button variant="ghost" size="sm" iconOnly aria-label="Zoom out" title="Zoom out (−)" icon={<Minus className="icon" aria-hidden="true" />} onClick={() => camera("zoom-out")} />
          <Button variant="ghost" size="sm" iconOnly aria-label="Rotate left" title="Rotate left ([)" icon={<RotateCcw className="icon" aria-hidden="true" />} onClick={() => camera("rotate-left")} />
          <Button variant="ghost" size="sm" iconOnly aria-label="Rotate right" title="Rotate right (])" icon={<RotateCw className="icon" aria-hidden="true" />} onClick={() => camera("rotate-right")} />
          <Button variant="ghost" size="sm" iconOnly aria-label="Home view" title="Home view (H)" icon={<Scan className="icon" aria-hidden="true" />} onClick={() => camera("home")} />
        </div>
      )}

      <div className="world-chat">
        <Bubbles narrow={narrow} />
        {demo && (
          <Chip className="demo-chat-chip" icon={<MessageCircle className="icon" aria-hidden="true" />}>
            Demo: replies are scripted
          </Chip>
        )}
      </div>

      {playback && <PlaybackBar playback={playback} />}

      {(textOpen || graphicsFailed) && <TextView ref={textRegion} lines={text} fallback={graphicsFailed} onClose={graphicsFailed ? null : closeText} />}
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


const SPEEDS: readonly { speed: PlaybackSpeed; label: string }[] = [
  { speed: 0, label: "Pause" },
  { speed: 1, label: "1x" },
  { speed: 4, label: "4x" },
  { speed: 16, label: "16x" },
];

function usePlayback(playback: PlaybackControls) {
  // A snapshot string, so useSyncExternalStore sees a stable value between changes.
  const snapshot = useSyncExternalStore(
    (listener) => playback.onChange(listener),
    () => `${Math.floor(playback.positionMs() / 1000)}|${playback.speed()}|${playback.loop()}`,
  );
  const [seconds, speed, loop] = snapshot.split("|").map(Number) as [number, number, number];
  return { positionMs: seconds * 1000, speed: speed as PlaybackSpeed, loop };
}

function PlaybackBar({ playback }: { playback: PlaybackControls }) {
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
        {position} / {duration}
      </span>
      <span className="playback-loop" title="How many times the script has looped">
        loop {loop}
      </span>
    </section>
  );
}

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
      </Card.Body>
    </Card>
  );
}
