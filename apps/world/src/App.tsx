import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type Ref } from "react";
import { ArrowLeft, BookOpen, ChevronRight, CircleHelp, Eye, FlaskConical, Hammer, MessageCircle, Minus, Monitor, Moon, Pause, Plus, RotateCcw, RotateCw, Footprints, Scan, Search, Settings, Sun, Tags, X } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { roleWords, ruleProps, zoningOf, type AgentPlacement, type CivicWords, type PlaybackControls, type PlaybackSpeed, type RoleId, type RoomWording, type TextLine, type WorldModel } from "@crewhub/world-model";
import type { PropModel } from "@crewhub/world-engine";
import { Bubbles } from "./components/bubbles/Bubbles";
import { attachSendFocusGuard } from "./state/dockFocus";
import { TownSettings } from "./components/TownSettings";
import { SourceSettings } from "./components/SourceSettings";
import { ConnectionChip, connectionLine, connectionWord } from "./components/ConnectionChip";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { ChatPanel } from "./components/ChatPanel";
import { Tour } from "./components/Tour";
import { nextAnnouncement } from "./state/announce";
import { sceneOwnsKey } from "./state/sceneKeys";
import { INTRODUCTION_URL, readTourDone, tourShouldStart, writeTourDone } from "./state/tour";
import { chatPlaceLine, recentEmptyWords } from "./state/chatRoad";
import { FirstSnapshot } from "./components/FirstSnapshot";
import { ConnectPage } from "./components/ConnectPage";
import type { Answer } from "./state/said";
import type { AnswerTarget } from "./state/recentAnswers";
import { useHealthNeed, useHostHealth, useLiveScreen } from "./state/health";
import { installSoakProbe } from "./state/soak";
import { pageReads } from "./state/soakPage";
import { markWords, saidMarks, type SaidMark } from "./world/saidText";
import { JumpList } from "./components/JumpList";
import { RecentAnswers } from "./components/RecentAnswers";
import { IconSprite } from "./components/Icon";
import { useMedia } from "./state/media";
import { useWindowKeydown } from "./state/windowKeys";
import { Button, Card, Chip, Field, Menu } from "./components/primitives";
import { SceneBoundary } from "./components/SceneBoundary";
import WorldCanvas from "./components/WorldCanvas";
import { shouldRetry } from "./api/client";
import { useAmbient } from "./state/ambient";
import { useCast } from "./state/cast";
import { castRegistry } from "./world/cast";
import { textViewLines, textViewSections, type TextSection } from "./world/textView";
import { styleRegistry } from "./world/style";
import { crumbs, districtsOf, homeName, isRegion, jumpEntries, needsOf, needsWords, summarise, summaryWords, type Crumb, type DistrictPlace, type JumpEntry, type Place } from "./world/wayfinding";
import { agentNameOf, hereOf, HOME_VIEW, insideOf, placeOf, stepView, type View, type ViewIntent, type ViewStep } from "./state/view";
import { toggleDetails, useDetails } from "./state/details";
import { toggleFps } from "./state/fps";
import { readRoleOverrides, writeRoleOverrides } from "./state/roleOverrides";
import { useBuildMode } from "./state/build";
import { useDark, useTheme } from "./state/theme";
import { townRuntime, useChat, useChatRoad, useConnection, useConnectionKey, useDirectorFeed, useRecentAnswers, useSaid, useTown, useWorld, worldRuntime } from "./state/runtimes";
import type { TownLayer } from "./world/propLayer";
import { pageConfig } from "./state/page";
import { translate } from "./i18n";
import type { ConnectionState } from "@crewhub/loops-client";
import type { Pick } from "./world/buildingView";
import { roomName } from "./world/roomWords";
import { useBuildingPlan } from "./state/buildingPlan";
import { dialogIsOpen, useOverlays } from "./state/overlays";
import { DirectorLog } from "./components/DirectorLog";
import { PresenceSettings } from "./components/PresenceSettings";
import { WhereForm } from "./components/WhereForm";
import { civicWords } from "./world/settlementDressing";
import type { CameraAction } from "./world/TownScene";
import { mmss } from "./world/townLayout";
import { useTownPlan } from "./state/plan";

// Build mode and the prop editor are not needed for the first frame: they load when first opened.
const BuildPanel = lazy(() => import("./components/BuildPanel").then(({ BuildPanel }) => ({ default: BuildPanel })));
const PropEditor = lazy(() => import("./components/PropEditor").then(({ PropEditor }) => ({ default: PropEditor })));

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const NEXT_THEME = { system: "light", light: "dark", dark: "system" } as const;

/* Below this width the chat is loops' narrow mode: a "Agent chats" menu in the corner and the chat as a full-screen dialog. */
const NARROW = "(max-width: 899px)";
// One media query list and one subscription for the page (state/media.ts): `matchMedia` on every render cost about
// 1 ms at 4x of the enter's render (round 25), and an inline subscribe re-subscribed on every render (round 30).
const useNarrow = () => useMedia(NARROW);

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches("input, select, textarea") || target.isContentEditable);
/** A control that uses Escape itself (text goes in): the world's Escape chain stays out. A select, a checkbox, a range or
    a file input does not, so Escape with the focus on one still closes the sheet it stands in (round 21). */
const swallowsEscape = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches("textarea") || (target.matches("input") && !target.matches('[type="checkbox"], [type="radio"], [type="range"], [type="file"]')));

/** A callback whose identity never changes but which always calls the latest `fn`, so memoised chrome skips renders. */
function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback((...args: A) => latest.current(...args), []);
}

export function App() {
  // The copied chat's query client, with the defaults loops' AppProviders gives its own.
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: shouldRetry } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <World />
    </QueryClientProvider>
  );
}

function World() {
  const { model, text, playback } = useWorld();
  // The long-session probe (state/soak.ts): the stores' sizes on `window.__worldStores` for tools/memory.mjs. Reads only.
  useEffect(() => installSoakProbe(pageReads(() => worldRuntime().connection?.state() ?? null)), []);
  const narrow = useNarrow();
  const dockHeight = useDockHeight();
  const { theme, cycle } = useTheme();
  useDirectorFeed();
  // The world view (state/view.ts): where it is, what is picked, the card, the follow, the walk and the camera commands
  // as one value, stepped by intents. The ref is the truth between renders (the scene sends intents from its frames,
  // several before React renders again); the state mirrors it for rendering.
  const viewRef = useRef<View>(HOME_VIEW);
  const [view, setView] = useState<View>(HOME_VIEW);
  const { entered, zoomed, selection, card, following } = view;
  const walking = view.walk !== null;
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  // The dialogs and panels over the town (state/overlays.ts): which are open, where the focus returns, what Escape closes.
  const [overlayState, overlays] = useOverlays();
  const { text: textOpen, settings: settingsOpen, connection: connectionOpen, tour: tourOpen, jump: jumpOpen, chat: chatOpen, editor: editorOpen } = overlayState.open;
  // The introduction inside the world (round 20): open by itself once per browser, or from Settings and the "?" menu.
  const tourAsked = useRef(false);
  const [announcement, setSpoken] = useState("");
  // The same sentence twice is heard twice (state/announce.ts, round 50 N3); one function for the page's life.
  const setAnnouncement = useCallback((text: string) => setSpoken((before) => nextAnnouncement(before, text)), []);
  // The Chat panel (components/ChatPanel, live mode): the agent it was opened for (its card), or none (the chip).
  const [chatAgent, setChatAgent] = useState<{ key: string; name: string } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, RoleId>>(readRoleOverrides);
  const ambient = useAmbient();
  const details = useDetails();
  useEffect(() => {
    writeRoleOverrides(overrides);
    worldRuntime().setRoleOverrides(overrides);
  }, [overrides]);
  const town = useTown();
  // The building template this viewer sees decides the words for places: rooms, or the three halls.
  const rooms = useBuildingPlan();
  const dark = useDark();
  // The prop editor: the prop it edits, or none for a new one.
  const [editedProp, setEditedProp] = useState<PropModel | null>(null);
  useEffect(() => townRuntime().onAnnounce(setAnnouncement), []);
  const textRegion = useRef<HTMLElement>(null),
    settingsCard = useRef<HTMLDivElement>(null);

  const buildings = model.buildings;
  const plan = useTownPlan(model, town.doc);
  const inside = insideOf(view, buildings);
  // The districts in use: a building stands in the district of its plot (after a regroup that is not its zone's).
  const districtKey = `${model.zones.map((z) => `${z.id}:${z.name}:${z.order}`).join("|")}#${model.buildings.map((b) => `${b.slug}:${b.zoneId}`).join("|")}`;
  const districts = useMemo(() => {
    const stands = new Map(plan.lots.map((lot) => [lot.slug, lot.districtZoneId]));
    return districtsOf(model, (slug) => stands.get(slug));
    // The model is a new object on every reduction; the districts follow who stands where.
  }, [districtKey, plan, model]);
  const here = hereOf(view, districts);
  const build = useBuildMode(town, inside, view.room, setAnnouncement, townRuntime());
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
  const cast = useCast();
  // The town document's zones and manual assignments decide each building's zone, before the source's groups.
  useEffect(() => worldRuntime().setZoning(zoningOf(town.doc)), [town.doc]);
  // A person's package lands at once under reduced motion: the reducer decides that, so it must know.
  useEffect(() => worldRuntime().setReducedMotion(reducedMotion), [reducedMotion]);
  // The host's town revision this page shows, as page state (`<html data-town-rev>`): what a check waits for instead of time.
  useEffect(() => {
    if (town.hostRev === null) delete document.documentElement.dataset["townRev"];
    else document.documentElement.dataset["townRev"] = String(town.hostRev);
  }, [town.hostRev]);
  // The civic places go by what stands there at this size: the lodge, the mailbox, the mail hut.
  const civic = useMemo(() => civicWords(plan.civic), [plan.civic.hall, plan.civic.post]);
  // What the agents just said to the person (round 12, state/said.ts): bubbles over the figures, and (round 14) the text
  // view's "says" lines and the chat marks over the buildings from the town.
  const said = useSaid();
  const marks = useMemo(() => saidMarks(model, said, Date.now()), [model, said]);
  // The Recent answers list (round 16, state/recentAnswers.ts): the last answers the page saw, in the Chat panel and the
  // text view; a row opens that agent's chat by the card's rule (round 13), or its card in the demo.
  const answers = useRecentAnswers();
  // The host's health as last read (the chat session's state for the Chat panel and the text view's Chat line); null in demo mode.
  const hostHealth = useHostHealth();
  // The chat road (round 28): the host's key, the page's own read, or neither; the words of every place that speaks of the chat.
  const chatRoad = useChatRoad();
  // Only while the text view shows: describing a region on every model update is felt on a phone.
  const textShown = textOpen || graphicsFailed;
  const textLines = useMemo(
    () => !textShown ? [] : textViewLines({ model, text, civic, rooms, viewerCast: cast, styleCast: styleRegistry.getStyle(town.doc.styleId).manifest.defaultCast, casts: castRegistry, town, rules, plan, said, nowMs: Date.now() }),
    [textShown, text, civic, rooms, cast, town.doc, town.catalogue, rules, town.invalid, model.zones, model.buildings, plan, said],
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
    const { title, project } = demo.createPropRequest(thing);
    const waits = demo.playback.positionMs() < demo.scenario.props.fromMs ? `There is no project yet: the ticket follows once ${project} exists. ` : "";
    const text = `Requested "${title}". ${waits}The ticket appears in the ${project} building, an agent posts the prop, and a person moves it to Done.`;
    setAnnouncement(text);
    return text;
  }, []);
  const saveProp = useCallback(
    (prop: PropModel) => {
      const result = townRuntime().edit({ type: "add-user-prop", prop });
      if (!result.ok) return result.error;
      overlays.close("editor");
      build.choose(prop.id);
      setAnnouncement(`${prop.name} saved under Mine and chosen for placing.`);
      return null;
    },
    [build],
  );

  // The view's intents go through one stable function (round 53, r53-review2 W1: a useCallback kept from an older render
  // held that render's whole scope; this one holds nothing but the ref). It steps the module with this render's facts,
  // keeps the ref and the state, says the sentence, and closes the page's overlay the view asks closed.
  const dispatch = useStable((intent: ViewIntent): ViewStep => {
    const before = viewRef.current;
    const step = stepView(before, intent, { model, districts, plan, rooms });
    if (step.view !== before) {
      viewRef.current = step.view;
      setView(step.view);
    }
    if (step.say !== null) setAnnouncement(step.say);
    if (step.close === "text") closeText();
    else if (step.close === "build") build.toggle();
    /* The agent card closes (its close button, or Escape reaching it in the chain): a focus that was in the card goes to
       the scene, not to the body (round 21; tools/a11y.mjs checks the canvas has it). */
    if (intent.type === "closeCard" || (intent.type === "escape" && before.card && !step.view.card)) {
      requestAnimationFrame(() => {
        if (document.activeElement === null || document.activeElement === document.body) focusScene();
      });
    }
    return step;
  });
  const back = useCallback(() => void dispatch({ type: "back" }), []);
  const startWalk = useCallback(() => void dispatch({ type: "startWalk" }), []);
  const stopWalk = useCallback(() => void dispatch({ type: "stopWalk" }), []);
  /* Goes to a place of any level (the breadcrumb, the jump list, a district's label, the text view). */
  const go = useCallback((place: Place, agent?: string) => void dispatch({ type: "go", place, agent }), []);
  const camera = useCallback((action: CameraAction) => void dispatch({ type: "camera", action }), []);
  const jump = useCallback((entry: JumpEntry) => {
    overlays.dismiss("jump");
    // The list closes on the chosen entry (not through closeJump): the scene takes the focus, so the arrow keys and
    // Enter work at once (Enter opens the card of a figure jumped to); the body would have had it (round 21).
    requestAnimationFrame(focusScene);
    dispatch({ type: "jump", entry });
  }, []);
  /** The jump list's active row's building (null when none or the list is closed): the scene builds it ahead. */
  const jumpActive = useCallback((entry: JumpEntry | null) => void dispatch({ type: "jumpActive", building: entry?.place.building ?? null }), []);
  const openJump = useCallback(() => overlays.open("jump"), []);
  const closeJump = useCallback(() => overlays.close("jump"), []);
  const jumps = useMemo(() => (jumpOpen ? jumpEntries(model, districts) : []), [jumpOpen, model, districts]);
  // A district that emptied or a town that shrank back to one settlement has no district level left.
  useEffect(() => {
    if (view.district !== null && here === null) dispatch({ type: "settle" });
  }, [view.district, here]);
  const pick = useCallback((target: Pick | null, hover: boolean) => void dispatch({ type: "pick", target, hover }), []);
  const selectedAgent = selection.selected?.kind === "agent" ? selection.selected.key : null;
  const agentName = useCallback((key: string) => agentNameOf(model, key), [model]);
  const follow = useCallback((key: string | null) => void dispatch({ type: "follow", key }), []);
  const openSettings = useCallback(() => overlays.open("settings"), []);
  // The page's chat (state/chat.ts): it follows the host's health and the building you are in; its navigations open Settings.
  const talk = useChat({ health: hostHealth, leadId: inside?.lead.id ?? null, openSettings });
  // Opening the chat for an agent (a bubble tap, a card's Chat button, an answer row; null: the chip) goes where the
  // page's chat (state/chat.ts) says: the agent's card in the demo, whose chat is its scripted dock, or the Chat panel,
  // whose Escape and close button return the focus to the opener.
  const openChat = useStable((key: string | null) => {
    const opening = talk.open(key);
    if ("card" in opening) {
      if (opening.card !== null) pick({ kind: "agent", key: opening.card }, false);
      return;
    }
    overlays.open("chat");
    setChatAgent(opening.panel);
    setAnnouncement(translate("world.chat.panel.announce"));
  });
  const closeChat = useCallback(() => overlays.close("chat"), []);
  const openAnswer = useStable((_a: Answer, target: AnswerTarget) => openChat(target.agent?.key ?? null));

  const openText = useCallback(() => overlays.open("text"), []);
  const closeText = useCallback(() => overlays.close("text"), []);
  const closeSettings = useCallback(() => overlays.close("settings"), []);
  /** "Show the introduction": from Settings (which closes first, so the tour's card stands over the town) or the "?" menu. */
  const openTour = useCallback(() => overlays.openTour(), []);
  const closeTour = useCallback(() => {
    writeTourDone();
    overlays.close("tour");
  }, []);
  // Leaving build mode unmounts its sheet; a focus that was in the sheet (the palette, by keyboard) would fall to the
  // body. It goes to the Build button in the toolbar instead (round 21).
  const buildWasOn = useRef(false);
  useEffect(() => {
    if (buildWasOn.current && !build.state.on) {
      requestAnimationFrame(() => {
        if (document.activeElement === null || document.activeElement === document.body) document.querySelector<HTMLElement>(".build-toggle")?.focus();
      });
    }
    buildWasOn.current = build.state.on;
  }, [build.state.on]);
  // The Connection panel (live mode): the chip opens it; Escape and its close button return the focus to the chip.
  const openConnection = useCallback(() => overlays.open("connection"), []);
  const closeConnection = useCallback(() => overlays.close("connection"), []);
  useEffect(() => {
    if (textOpen) textRegion.current?.focus();
  }, [textOpen]);
  useEffect(() => {
    if (settingsOpen) settingsCard.current?.querySelector<HTMLElement>("button")?.focus();
  }, [settingsOpen]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReducedMotion(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);

  // Keys that work anywhere outside a text field: T, Escape and Backspace, and the camera keys. The handler is this
  // render's; the window listener is added once and calls the latest one (state/windowKeys.ts, round 32).
  useWindowKeydown((e: KeyboardEvent) => {
    // The introduction: Escape skips it wherever the focus is (the card handles it itself while the focus is inside).
    if (tourOpen && e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      closeTour();
      return;
    }
    // The jump list opens from anywhere, a text field included (Cmd or Ctrl+K types nothing).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k" && !editorOpen) {
      e.preventDefault();
      if (jumpOpen) closeJump();
      else openJump();
      return;
    }
    if (typing(e.target) && (e.key !== "Escape" || swallowsEscape(e.target))) return;
    // Undo and redo of layout edits while build mode is on.
    if (build.state.on && (e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
      e.preventDefault();
      if (e.key.toLowerCase() === "y" || e.shiftKey) redo();
      else undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Escape closes the innermost thing first: the page's dialogs by their order (state/overlays.ts), then build mode's
    // drag, selection and chosen prop, then the view's own chain (state/view.ts).
    if (e.key === "Escape") {
      const dialog = overlays.escapeTarget();
      if (dialog !== null) {
        e.preventDefault();
        overlays.close(dialog);
        return;
      }
    }
    // The prop editor and the jump list keep the keys below from the page (the jump list after B, as ever).
    if (editorOpen) return;
    // While walking, the movement keys are the walk's (WorldCanvas), and the mode keys that share them wait.
    if (walking && /^(w|a|s|d|b|shift|arrow(up|down|left|right)|enter)$/i.test(e.key)) return;
    if (e.key.toLowerCase() === "b" && !graphicsFailed) {
      e.preventDefault();
      build.toggle();
      return;
    }
    if (jumpOpen) return;
    if (e.key === "/") {
      e.preventDefault();
      openJump();
      return;
    }
    if (build.key(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      // The view's Escape chain (state/view.ts), innermost first: the walk, build mode, the text view, the follow, the
      // card, the selection, the zoomed room, the building, the district. Nothing left: the key is nobody's.
      if (dispatch({ type: "escape", open: { text: textOpen, build: build.state.on } }).handled) e.preventDefault();
      return;
    }
    if (e.key.toLowerCase() === "w" && !graphicsFailed && !build.state.on && !textOpen && !settingsOpen && !selection.selected) {
      e.preventDefault();
      startWalk();
      return;
    }
    // Shift+F follows the selected agent (F alone is the frame rate overlay).
    if (e.key.toLowerCase() === "f" && e.shiftKey && !graphicsFailed && (selectedAgent || following)) {
      e.preventDefault();
      follow(following ? null : selectedAgent);
      return;
    }
    if (e.key === "Backspace" && entered && !walking) {
      e.preventDefault();
      back();
      return;
    }
    if (e.key.toLowerCase() === "d" && !graphicsFailed) {
      e.preventDefault();
      setAnnouncement(toggleDetails() ? "Details on: every label shows." : "Details off: names and one bubble per robot.");
      return;
    }
    if (e.key.toLowerCase() === "f" && !e.shiftKey && !graphicsFailed) {
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
  });

  // Arrow keys and Enter move the focus ring between plots while the scene has keyboard focus (state/view.ts decides).
  const sceneKey = (e: ReactKeyboardEvent) => {
    if (typing(e.target) || e.altKey || e.ctrlKey || e.metaKey || walking) return;
    // A key in the agent card (it sits in the stage) is the card's, not the scene's (state/sceneKeys.ts, round 50 A4).
    if (!sceneOwnsKey(e.target instanceof Element ? e.target : null)) return;
    // Build mode moves the chosen or selected prop with the arrow keys (the window listener handles them).
    if (build.state.on && inside && (build.state.propId || build.state.selected)) return;
    if (dispatch({ type: "key", key: e.key, onCanvas: e.target === e.currentTarget.querySelector("canvas") }).handled) e.preventDefault();
  };

  const demo = model.mode === "demo";
  const connection = useConnection();
  // A change of the connection's state (Live, Loops down, Catching up, Stream busy, back to Live) is said once in the live
  // region: the chip changes its word, and a screen reader would otherwise hear nothing. Not the first value on load.
  const spokenConnection = useRef<ConnectionState | null>(null);
  useEffect(() => {
    if (spokenConnection.current !== null && connection !== null && spokenConnection.current !== connection)
      setAnnouncement(translate("world.connection.changed", { state: connectionWord(connection), hint: translate(`world.connection.hint.${connection}`) }));
    spokenConnection.current = connection;
  }, [connection]);
  // The text view's Chat line and the Chat panel's small print say the chat session's state (round 14): one health read
  // when either opens on a live page (state/health.ts, the `glance` need), so the words are the host's current ones.
  useHealthNeed(!demo && textOpen ? "glance" : null);
  useHealthNeed(!demo && chatOpen ? "glance" : null);
  const trailNames = { home: homeName(districts), district: here?.name ?? null, building: inside?.name ?? null, room: inside && zoomed ? roomName(inside, zoomed, rooms) : null };
  const trail = useMemo(
    () => crumbs(placeOf(view, districts), trailNames),
    // The names decide; the object is new each render.
    [here?.id, inside?.slug, zoomed, JSON.stringify(trailNames)],
  );

  // Unpaired (state/connect.ts `liveScreen`): the host answered 401 not_paired after the town was up (a host restarted
  // without its pairing secret, or the cookie gone). The Pair screen stands in for the town until the source, which keeps
  // asking every couple of seconds, is live again with the new link's cookie; then the town comes back by itself.
  // Unauthorized or loops down: the host's own word on its key says what it is (none after a Forget in another tab: the
  // Connect screen; rejected: the rejected screen). The stream's word goes to the host's health (state/health.ts), which
  // reads again when it changes (the chat road follows it), polls a host from before round 11 that leaves the key unsaid,
  // and says which screen stands in for the town.
  const streamKey = useConnectionKey();
  const screen = useLiveScreen(demo ? null : { connection, key: streamKey });
  // The tour starts by itself once the town stands (a short beat after the model has buildings, or at once in the demo),
  // never over a Connect screen, a dialog or a failed scene, never for a tool's browser, never again after Skip or Done.
  const dialogOpen = dialogIsOpen(overlayState) || card || build.state.on;
  const townStands = demo || model.buildings.length > 0;
  useEffect(() => {
    if (tourAsked.current || !townStands || screen !== null) return;
    const timer = setTimeout(() => {
      if (tourAsked.current) return;
      tourAsked.current = true;
      if (tourShouldStart({ done: readTourDone(), webdriver: navigator.webdriver === true, search: location.search, screenShown: screen !== null, dialogOpen, graphicsFailed })) overlays.startTour();
    }, 1500);
    return () => clearTimeout(timer);
  }, [townStands, screen, dialogOpen, graphicsFailed]);
  if (screen !== null) return <ConnectPage screen={screen} />;

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

      {/* The corners come before the scene, so Tab reaches the header before the scene's labels, as it is seen (round 52,
          r50-a11y A9); they still paint over the scene's top overlays by their z-index (world.css `.world-corner`). */}
      <Corner demo={demo} connection={connection} connectionOpen={connectionOpen} onOpenConnection={openConnection} graphicsFailed={graphicsFailed} trail={trail} onGo={go} onJump={openJump} jumpOpen={jumpOpen} following={following ? agentName(following) : null} onStopFollow={() => follow(null)} />

      <CornerTools theme={theme} cycle={cycle} details={details} buildOn={build.state.on} toggleBuild={build.toggle} settingsOpen={settingsOpen} openSettings={openSettings} closeSettings={closeSettings} graphicsFailed={graphicsFailed} openTour={openTour} openText={openText} />

      <main className="world-stage" onKeyDown={sceneKey} aria-label="CrewHub World">
        {graphicsFailed ? null : (
          <SceneBoundary onError={() => setGraphicsFailed(true)}>
            <WorldCanvas
              model={model}
              said={said}
              onSaidTap={openChat}
              marks={marks}
              plan={plan}
              view={view}
              onIntent={dispatch}
              reducedMotion={reducedMotion}
              ambient={ambient}
              details={details}
              districts={districts}
              onError={() => setGraphicsFailed(true)}
              onAnnounce={setAnnouncement}
              town={townLayer}
              onBuild={build.pointer}
              onChat={talk.panel ? openChat : null}
            />
          </SceneBoundary>
        )}
        {!demo && connection === "connecting" && <FirstSnapshot />}
      </main>

      {connectionOpen && connection && <ConnectionPanel state={connection} onClose={closeConnection} />}

      {chatOpen && <ChatPanel agent={chatAgent} health={hostHealth} road={chatRoad} full={narrow} answers={answers} recentEmpty={recentEmptyWords("live", chatRoad)} targetOf={talk.answerTarget} onAnswer={openAnswer} onClose={closeChat} />}

      {jumpOpen && <JumpList entries={jumps} onJump={jump} onClose={closeJump} onActive={jumpActive} />}

      {tourOpen && <Tour mode={demo ? "demo" : "live"} reducedMotion={reducedMotion} returnTo={overlayState.tourReturn} onClose={closeTour} />}

      {settingsOpen && (
        <Card ref={settingsCard} className="world-sheet settings-sheet" role="dialog" aria-labelledby="settings-title">
          <Card.Header
            title="Settings"
            titleId="settings-title"
            action={<Button variant="ghost" size="sm" iconOnly aria-label="Close settings" icon={<X className="icon" aria-hidden="true" />} onClick={closeSettings} />}
          />
          <Card.Body>
            <div className="settings-tour">
              <Button size="sm" icon={<BookOpen className="icon icon-sm" aria-hidden="true" />} onClick={openTour}>
                {translate("world.tour.show")}
              </Button>
              <span className="hint">{translate("world.tour.showHint")}</span>
            </div>
            <SourceSettings />
            <RoleSettings model={model} overrides={overrides} onChange={setOverrides} />
            <TownSettings town={town} />
            <p className="sign-muted">{translate(demo ? "world.settings.agentsDemo" : "world.settings.agentsLive")}</p>
            <PresenceSettings reducedMotion={reducedMotion} demo={demo} />
          </Card.Body>
        </Card>
      )}

      {build.state.on && !graphicsFailed && (
        <Suspense fallback={null}>
          <BuildPanel
            build={build}
            town={town}
            plan={plan}
            inside={inside}
            demo={demo}
            onClose={build.toggle}
            onUndo={undo}
            onRedo={redo}
            onEdit={(propId) => {
              setEditedProp(propId ? (town.catalogue.get(propId)?.model ?? null) : null);
              overlays.open("editor");
            }}
            onRequest={requestProp}
          />
        </Suspense>
      )}
      {editorOpen && (
        <Suspense fallback={null}>
          <PropEditor
            initial={editedProp}
            takenIds={town.catalogue.entries.map((e) => e.id)}
            theme={dark ? "lamplight" : "day"}
            onSave={saveProp}
            onClose={() => overlays.close("editor")}
          />
        </Suspense>
      )}

      {!graphicsFailed && <CameraToolbar camera={camera} walking={walking} toggleWalk={walking ? stopWalk : build.state.on ? null : startWalk} />}

      <ChatCorner narrow={narrow} demo={demo} connection={connection} chatOpen={chatOpen} onOpenChat={() => openChat(null)} />

      {playback && <PlaybackBar playback={playback} />}

      {(textOpen || graphicsFailed) && <TextView civic={civic} rooms={rooms} ref={textRegion} lines={textLines} connection={connection} chat={chatPlaceLine(demo ? "demo" : "live", chatRoad)} marks={marks} answers={answers} recentEmpty={recentEmptyWords(demo ? "demo" : "live", chatRoad)} targetOf={talk.answerTarget} onAnswer={openAnswer} fallback={graphicsFailed} onClose={graphicsFailed ? null : closeText} districts={districts} onGo={graphicsFailed ? null : go} />}
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
              <option value="">{a.roleSource === "override" ? "From the rules" : roleWords(a.role, a.roleSource, "you")}</option>
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
const SCENARIO_CHOICES = pageConfig().scenarioChoices;

const Corner = memo(function Corner({
  demo,
  connection,
  connectionOpen,
  onOpenConnection,
  graphicsFailed,
  trail,
  onGo,
  onJump,
  jumpOpen,
  following,
  onStopFollow,
}: {
  demo: boolean;
  /** The live source's state, where the Demo chip stands in demo mode; null for the demo. */
  connection: ConnectionState | null;
  /** Whether the Connection panel is open; the chip opens it. */
  connectionOpen: boolean;
  onOpenConnection: () => void;
  graphicsFailed: boolean;
  /** Where you are, outermost first: region or town, district, building, room. */
  trail: Crumb[];
  onGo: (place: Place) => void;
  onJump: () => void;
  jumpOpen: boolean;
  /** The name of the agent the camera follows, or null. */
  following: string | null;
  onStopFollow: () => void;
}) {
  const scenario = SCENARIO_CHOICES.find((choice) => choice.current)?.name ?? "";
  // One step out is the button Escape presses; the levels above it are plain crumbs to click.
  const parent = trail.length > 1 ? trail[trail.length - 2]! : null;
  return (
    <header className="world-corner world-corner-left" data-chrome="">
      <div className="world-brand">
        <span className="brand-mark" aria-hidden="true" />
        <strong>CrewHub World</strong>
        {/* The phone's short title (design choice T6), shown under 600 px in the full one's place; the tools read the visible strong. */}
        <strong className="brand-short">CrewHub</strong>
        {demo && (
          <Menu
            name="Demo scenario"
            className="demo-menu"
            initialFocus="checked"
            trigger={{
              variant: "chip",
              className: "demo-chip",
              icon: <FlaskConical className="icon" aria-hidden="true" />,
              label: (
                <>
                  <span className="demo-word">Demo: {scenario}</span>
                  <span className="demo-word demo-word-short">Demo</span>
                </>
              ),
              ariaLabel: `Demo: scripted data. Scenario: ${scenario}. Choose a scenario`,
            }}
            items={[
              { group: "Demo scenario" },
              ...SCENARIO_CHOICES.map((choice) => ({
                label: choice.name,
                value: choice.id,
                hint: choice.summary,
                checked: choice.current,
                // Each scenario is its own page (its own source and town document): choosing one loads it.
                onSelect: () => !choice.current && globalThis.location.assign(choice.href),
              })),
            ]}
          />
        )}
        {!demo && connection && <ConnectionChip state={connection} open={connectionOpen} onOpen={onOpenConnection} />}
      </div>
      {!graphicsFailed && (
        <nav className="world-breadcrumb" aria-label="Where you are" data-levels={trail.length}>
          {trail.map((crumb, index) => {
            const current = crumb.to === null;
            const to = crumb.to;
            return (
              <span key={crumb.level} className="crumb" data-level={crumb.level} data-parent={crumb === parent ? "" : undefined}>
                {index > 0 && <ChevronRight className="icon icon-sm crumb-sep" aria-hidden="true" />}
                {current || !to ? (
                  <span className="crumb-current" aria-current="location">
                    {crumb.label}
                  </span>
                ) : crumb === parent ? (
                  <Button size="sm" icon={<ArrowLeft className="icon" aria-hidden="true" />} onClick={() => onGo(to)} kbd="Esc">
                    {crumb.label}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => onGo(to)}>
                    {crumb.label}
                  </Button>
                )}
              </span>
            );
          })}
          <Button className="jump-button" size="sm" variant="ghost" icon={<Search className="icon" aria-hidden="true" />} aria-label="Jump to a district, project or agent" title="Jump to… (/ or Ctrl+K)" expanded={jumpOpen} onClick={onJump} kbd="/">
            <span className="jump-word">Jump to</span>
          </Button>
          {following && (
            <span className="crumb crumb-follow" role="status">
              <ChevronRight className="icon icon-sm crumb-sep" aria-hidden="true" />
              <span className="crumb-current">
                <Eye className="icon icon-sm" aria-hidden="true" />
                Following {following}
              </span>
              <Button size="sm" variant="ghost" iconOnly aria-label={`Stop following ${following}`} title="Stop following (Esc)" icon={<X className="icon" aria-hidden="true" />} onClick={onStopFollow} />
            </span>
          )}
        </nav>
      )}
    </header>
  );
});

/** The scene's canvas takes the focus: the arrow keys, Enter and Escape then work on the world (after a jump, after a sheet). */
const focusScene = () => document.querySelector<HTMLElement>("main.world-stage canvas")?.focus();

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
  openTour: () => void;
  /** The text view from the "?" menu (round 64, w4-7): a touch device has no T key and never meets the skip link. */
  openText: () => void;
}) {
  const { theme, cycle, details, buildOn, toggleBuild, settingsOpen, openSettings, closeSettings, graphicsFailed, openTour, openText } = props;
  const ThemeIcon = THEME_ICON[theme];
  return (
    <div className="world-corner world-corner-right" data-chrome="">
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
          className="build-toggle"
          aria-label={buildOn ? "Leave build mode (B)" : "Build mode (B)"}
          title={buildOn ? "Leave build mode (B)" : "Build mode (B)"}
          pressed={buildOn}
          icon={<Hammer className="icon" aria-hidden="true" />}
          onClick={toggleBuild}
        />
      )}
      <Menu
        name={translate("world.tour.help")}
        className="help-menu"
        align="end"
        trigger={{ variant: "ghost", iconOnly: true, ariaLabel: translate("world.tour.help"), label: translate("world.tour.help"), icon: <CircleHelp className="icon" aria-hidden="true" /> }}
        items={[
          { label: translate("world.tour.show"), hint: translate("world.tour.showHint"), onSelect: openTour },
          { label: translate("world.tour.read"), hint: translate("world.tour.readHint"), onSelect: () => void window.open(INTRODUCTION_URL, "_blank", "noopener,noreferrer") },
          // The open waits a frame (w2's review of w4-7): the menu runs a row's onSelect before it closes and refocuses
          // Help, and the text view takes the focused element as its return slot; opened at once, that slot would be
          // the row, unmounted a tick later, and Escape from the view would drop the focus to the body.
          { label: translate("world.text.open"), hint: translate("world.text.openHint"), onSelect: () => requestAnimationFrame(openText) },
        ]}
      />
      <Button variant="ghost" iconOnly aria-label="Settings" title="Settings" expanded={settingsOpen} icon={<Settings className="icon" aria-hidden="true" />} onClick={settingsOpen ? closeSettings : openSettings} />
    </div>
  );
});

const CameraToolbar = memo(function CameraToolbar({ camera, walking, toggleWalk }: { camera: (type: CameraAction) => void; walking: boolean; toggleWalk: (() => void) | null }) {
  return (
    <div className="camera-toolbar" role="toolbar" aria-label="Camera" data-chrome="">
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={walking ? "Stop walking (Escape)" : "Walk (W)"}
        title={walking ? "Stop walking (Esc)" : "Walk around (W)"}
        pressed={walking}
        disabled={!toggleWalk}
        icon={<Footprints className="icon" aria-hidden="true" />}
        onClick={() => toggleWalk?.()}
      />
      <Button variant="ghost" size="sm" iconOnly aria-label="Zoom in" title="Zoom in (+)" icon={<Plus className="icon" aria-hidden="true" />} onClick={() => camera("zoom-in")} />
      <Button variant="ghost" size="sm" iconOnly aria-label="Zoom out" title="Zoom out (−)" icon={<Minus className="icon" aria-hidden="true" />} onClick={() => camera("zoom-out")} />
      <Button variant="ghost" size="sm" iconOnly aria-label="Rotate left" title="Rotate left ([)" icon={<RotateCcw className="icon" aria-hidden="true" />} onClick={() => camera("rotate-left")} />
      <Button variant="ghost" size="sm" iconOnly aria-label="Rotate right" title="Rotate right (])" icon={<RotateCw className="icon" aria-hidden="true" />} onClick={() => camera("rotate-right")} />
      <Button variant="ghost" size="sm" iconOnly aria-label="Home view" title="Home view (H)" icon={<Scan className="icon" aria-hidden="true" />} onClick={() => camera("home")} />
    </div>
  );
});

/* In demo mode the copied dock and its "replies are scripted" note; in live mode the Chat chip, which opens the Chat
   panel: crewhub-loops' own chat framed in the world (components/ChatPanel; a session cookie never reaches the world,
   the frame carries the person's own). */
const ChatCorner = memo(function ChatCorner({ narrow, demo, connection, chatOpen, onOpenChat }: { narrow: boolean; demo: boolean; connection: ConnectionState | null; chatOpen: boolean; onOpenChat: () => void }) {
  // Round 64 (w5-8): the copied dock disables its box and Send while a message goes, which drops the focus to the body; the guard (state/dockFocus) brings it back.
  useEffect(() => (demo ? attachSendFocusGuard(document) : undefined), [demo]);
  if (!demo)
    return (
      <div className="world-chat" data-chrome="">
        <button type="button" className="chip-button chat-open" title={translate("world.chat.openHint")} aria-label={translate("world.chat.openHint")} aria-expanded={chatOpen} aria-haspopup="dialog" data-connection={connection ?? undefined} onClick={onOpenChat}>
          <Chip className="demo-chat-chip" icon={<MessageCircle className="icon" aria-hidden="true" />}>{translate("world.chat.open")}</Chip>
        </button>
      </div>
    );
  return (
    <div className="world-chat" data-chrome="">
      <Bubbles narrow={narrow} />
      <Chip className="demo-chat-chip" icon={<MessageCircle className="icon" aria-hidden="true" />}>
        Demo: replies are scripted
      </Chip>
    </div>
  );
});

/** One playback value as a stable snapshot, so a component re-renders only when that value changes. */
function usePlaybackValue<T extends string | number>(playback: PlaybackControls, read: () => T): T {
  return useSyncExternalStore((listener) => playback.onChange(listener), read);
}

/* The speed buttons change rarely; the position ticks every second of script time (16 a second at 16x). They subscribe
   apart, so the ticking time does not re-render the buttons. */
const PlaybackBar = memo(function PlaybackBar({ playback }: { playback: PlaybackControls }) {
  const speed = usePlaybackValue(playback, () => playback.speed()) as PlaybackSpeed;
  return (
    <section className="playback-bar" aria-label="Demo playback" data-chrome="">
      <div className="segmented playback-speeds" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <Button key={s.speed} size="sm" className="btn-segmented" pressed={speed === s.speed} aria-label={s.speed ? `Play at ${s.label}` : "Pause"} onClick={() => playback.setSpeed(s.speed)}>
            {s.speed ? s.label : <Pause className="icon" aria-hidden="true" />}
          </Button>
        ))}
      </div>
      <PlaybackPosition playback={playback} />
    </section>
  );
});

function PlaybackPosition({ playback }: { playback: PlaybackControls }) {
  const positionMs = usePlaybackValue(playback, () => Math.floor(playback.positionMs() / 1000) * 1000);
  const loop = usePlaybackValue(playback, () => playback.loop());
  const position = mmss(positionMs),
    duration = mmss(playback.durationMs);
  return (
    <>
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
    </>
  );
}

const KIND_WORD: Record<TextLine["kind"], string> = { fact: "fact", inference: "inference", cosmetic: "cosmetic", demo: "demo" };

function TextView({ lines, civic, rooms, connection, chat, marks, answers, recentEmpty, targetOf, onAnswer, fallback, onClose, districts, onGo, ref }: { lines: TextLine[]; civic: CivicWords; rooms: RoomWording; connection: ConnectionState | null; /** Where chat lives (state/chatPanel `chatPlaceLine`). */ chat: string; /** The agents inside a building with a bubble in flight (world/saidText): a chip beside the building, as the mark over it. */ marks: SaidMark[]; /** The Recent answers section (round 16, components/RecentAnswers). */ answers: readonly Answer[]; recentEmpty: string; targetOf: (answer: Answer) => AnswerTarget; onAnswer: (answer: Answer, target: AnswerTarget) => void; fallback: boolean; onClose: (() => void) | null; districts: DistrictPlace[]; onGo: ((place: Place) => void) | null; ref: Ref<HTMLElement> }) {
  // The town first, then every building's sections under its district, then the rest (casts, zones, the town document).
  const view = textViewSections(lines, districts);
  const region = isRegion(districts);
  const block = (section: TextSection, level: 3 | 4) => {
    const Heading = `h${level}` as "h3" | "h4";
    return (
      <section key={section.name} className="text-section">
        <Heading>{section.name}</Heading>
        <ul>
          {section.lines.map((line, i) => (
            <li key={i}>
              <span className="text-kind" data-kind={line.kind}>
                {KIND_WORD[line.kind]}
              </span>
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  };
  return (
    <Card as="section" ref={ref} id="text-view" className={`world-sheet text-sheet${fallback ? " fallback" : ""}`} role="region" aria-labelledby="text-view-title" tabIndex={-1}>
      <Card.Header
        title="Text view of the world"
        titleId="text-view-title"
        action={onClose ? <Button variant="ghost" size="sm" iconOnly aria-label="Close the text view" icon={<X className="icon" aria-hidden="true" />} onClick={onClose} /> : undefined}
      />
      <Card.Body>
        {fallback && <p className="text-note">3D graphics are not available here, so the world is shown as text.</p>}
        {connection && (
          <p className="text-note text-connection" role="status" data-connection={connection}>
            {connectionLine(connection)}
          </p>
        )}
        <p className="text-note text-chat">{chat}</p>
        <RecentAnswers as="section" answers={answers} empty={recentEmpty} targetOf={targetOf} onOpen={onAnswer} />
        <WhereForm civic={civic} rooms={rooms} />
        {view.before.map((section) => block(section, 3))}
        {view.districts.map(({ district: d, buildings }) => {
          const summary = summarise(d.buildings);
          return (
            <section key={d.id} className="text-district" aria-label={d.name}>
              <header className="text-district-head">
                <h3>{region ? d.name : "Buildings"}</h3>
                {region && onGo && (
                  <Button size="sm" onClick={() => onGo({ district: d.id, building: null, room: null })}>
                    Go to {d.name}
                  </Button>
                )}
              </header>
              <p className="text-district-summary">
                <span className="text-kind" data-kind="fact">
                  fact
                </span>
                <span>{summaryWords(summary)}</span>
              </p>
              {buildings.map(({ building: b, sections }) => {
                const needs = needsWords(needsOf(b));
                return (
                  <div key={b.slug} className="text-building">
                    <p className="text-jump">
                      {onGo ? (
                        <Button size="sm" variant="ghost" onClick={() => onGo({ district: d.id, building: b.slug, room: null })}>
                          Go inside {b.name}
                        </Button>
                      ) : (
                        <strong>{b.name}</strong>
                      )}
                      {needs && <Chip.Attention>Needs a person: {needs}</Chip.Attention>}
                      {marks
                        .filter((m) => m.slug === b.slug)
                        .map((m) => (
                          <Chip key={m.agent} className="text-answered" icon={<MessageCircle className="icon icon-sm" aria-hidden="true" />}>
                            {markWords(m)}
                          </Chip>
                        ))}
                    </p>
                    {sections.map((section) => block(section, 4))}
                  </div>
                );
              })}
            </section>
          );
        })}
        {view.after.map((section) => block(section, 3))}
        <DirectorLog />
      </Card.Body>
    </Card>
  );
}
