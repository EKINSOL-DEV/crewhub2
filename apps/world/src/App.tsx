import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type Ref } from "react";
import { ArrowLeft, BookOpen, ChevronRight, CircleHelp, Eye, FlaskConical, Hammer, MessageCircle, Minus, Monitor, Moon, Pause, Plus, RotateCcw, RotateCw, Footprints, Scan, Search, Settings, Sun, Tags, X } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { agentCardFacts, archivedWords, CIVIC_WORDS, describeTownDocument, describeWorld, roleWords, ruleProps, zoningOf, type AgentPlacement, type CivicWords, type PlaybackControls, type PlaybackSpeed, type RoleId, type RoomKind, type RoomWording, type TextLine, type WorldModel } from "@crewhub/world-model";
import type { PropModel } from "@crewhub/world-engine";
import { Bubbles } from "./components/bubbles/Bubbles";
import { TownSettings } from "./components/TownSettings";
import { SourceSettings } from "./components/SourceSettings";
import { ConnectionChip, connectionLine, connectionWord } from "./components/ConnectionChip";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { ChatPanel } from "./components/ChatPanel";
import { Tour } from "./components/Tour";
import { INTRODUCTION_URL, readTourDone, tourShouldStart, writeTourDone } from "./state/tour";
import { chatPlaceLine, recentEmptyWords } from "./state/chatRoad";
import { useChatRoad } from "./state/chatRoadStore";
import { FirstSnapshot } from "./components/FirstSnapshot";
import { CONNECT_POLL_MS, ConnectPage } from "./components/ConnectPage";
import { liveScreen, withStreamKey } from "./state/connect";
import { useRecentAnswers, useSaid, type Answer } from "./state/said";
import { answerTarget, type AnswerTarget } from "./state/recentAnswers";
import { rememberHealth, useHostHealth } from "./state/health";
import { healthRereadKey, hostKeyReadsChat, loopsOriginOf } from "./state/pageChat";
import { startPageChat } from "./state/pageChatPage";
import { installSoakProbe } from "./state/soak";
import { pageReads } from "./state/soakPage";
import { markWords, saidLines, saidMarks, type SaidMark } from "./world/saidText";
import { JumpList } from "./components/JumpList";
import { RecentAnswers } from "./components/RecentAnswers";
import { IconSprite } from "./components/Icon";
import { useMedia } from "./state/media";
import { Button, Card, Chip, Field, Menu } from "./components/primitives";
import { SceneBoundary } from "./components/SceneBoundary";
import WorldCanvas, { type Selection } from "./components/WorldCanvas";
import { createChatQueryClient, useChatEvents, useChatNavigation, useChatView } from "./state/chat";
import { useAmbient } from "./state/ambient";
import { useCast } from "./state/cast";
import { castRegistry } from "./world/cast";
import { describeCasts } from "./world/castText";
import { describeZones, townKeeping, townKeepingWords } from "./world/zoneText";
import { styleRegistry } from "./world/style";
import { crumbs, districtsOf, homeName, isRegion, jumpEntries, needsOf, needsWords, stepOut, summarise, summaryWords, type Crumb, type DistrictPlace, type JumpEntry, type Place } from "./world/wayfinding";
import { toggleDetails, useDetails } from "./state/details";
import { toggleFps } from "./state/fps";
import { readRoleOverrides, writeRoleOverrides } from "./state/roleOverrides";
import { useBuildMode } from "./state/build";
import { useDark, useTheme } from "./state/theme";
import { townRuntime, useTown } from "./state/town";
import type { TownLayer } from "./world/propLayer";
import { scenarioChoices, SOURCE, useConnection, useConnectionKey, useWorld, worldRuntime } from "./state/world";
import { translate } from "./i18n";
import { probeHost, type ConnectionState, type HostHealth } from "@crewhub/loops-client";
import { buildingTemplate } from "./world/buildingTemplate";
import type { Pick } from "./world/buildingView";
import { firstRoom, roomNeighbor } from "./world/interiorLayout";
import { roomName, roomSummary, zoomedTo } from "./world/roomWords";
import { useBuildingPlan } from "./state/buildingPlan";
import { DirectorLog } from "./components/DirectorLog";
import { PresenceSettings } from "./components/PresenceSettings";
import { WhereForm } from "./components/WhereForm";
import { civicWords } from "./world/settlementDressing";
import { useDirectorFeed } from "./state/director";
import type { CameraAction } from "./world/TownScene";
import { countsLine, laneWords, mmss } from "./world/townLayout";
import { describePlan, moveFocus } from "./world/townPlan";
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
  const [queryClient] = useState(createChatQueryClient);
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
  const [entered, setEntered] = useState<string | null>(null);
  const [focused, setFocused] = useState(0);
  const [ringVisible, setRingVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [graphicsFailed, setGraphicsFailed] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  // The introduction inside the world (round 20): open by itself once per browser, or from Settings and the "?" menu.
  const [tourOpen, setTourOpen] = useState(false);
  const tourAsked = useRef(false);
  /** Where the focus goes when the tour closes: the Settings button when Settings opened it (its own button is gone with the sheet). */
  const tourReturn = useRef<HTMLElement | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [action, setAction] = useState<{ id: number; type: CameraAction }>({ id: 0, type: "home" });
  const [room, setRoom] = useState<RoomKind | null>(null);
  const [zoomed, setZoomed] = useState<RoomKind | null>(null);
  // The district the view is in (a region only): the level between the home view and a building.
  const [district, setDistrict] = useState<string | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  /** The jump list's active row's building (null when none or the list is closed): the scene builds it ahead. */
  const [likely, setLikely] = useState<string | null>(null);
  const jumpActive = useCallback((entry: JumpEntry | null) => setLikely(entry?.place.building ?? null), []);
  const [flight, setFlight] = useState<{ id: number; anchor: string; reach?: number }>({ id: 0, anchor: "" });
  const [selection, setSelection] = useState<Selection>({ hover: null, selected: null });
  // Walk mode: the person walks a visitor through the world. The level it began on is kept for the way back.
  const [walking, setWalking] = useState(false);
  const walkBack = useRef<{ entered: string | null; room: RoomKind | null; zoomed: RoomKind | null; district: string | null } | null>(null);
  // The agent card (open for the selected agent) and the agent the camera follows (components/AgentCard).
  const [card, setCard] = useState(false);
  const [following, setFollowing] = useState<string | null>(null);
  // The Chat panel (components/ChatPanel, live mode): open, with the agent it was opened for (its card) or none (the chip).
  const [chat, setChat] = useState<{ agent: { key: string; name: string } | null } | null>(null);
  const chatReturn = useRef<HTMLElement | null>(null);
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
  const [editing, setEditing] = useState<{ prop: PropModel | null } | null>(null);
  useEffect(() => townRuntime().onAnnounce(setAnnouncement), []);
  const returnFocus = useRef<HTMLElement | null>(null);
  const textRegion = useRef<HTMLElement>(null),
    settingsCard = useRef<HTMLDivElement>(null);

  const buildings = model.buildings;
  const plan = useTownPlan(model, town.doc);
  const inside = buildings.find((b) => b.slug === entered) ?? null;
  const camera = useCallback((type: CameraAction) => setAction((a) => ({ id: a.id + 1, type })), []);
  // The districts in use: a building stands in the district of its plot (after a regroup that is not its zone's).
  const districtKey = `${model.zones.map((z) => `${z.id}:${z.name}:${z.order}`).join("|")}#${model.buildings.map((b) => `${b.slug}:${b.zoneId}`).join("|")}`;
  const districts = useMemo(() => {
    const stands = new Map(plan.lots.map((lot) => [lot.slug, lot.districtZoneId]));
    return districtsOf(model, (slug) => stands.get(slug));
    // The model is a new object on every reduction; the districts follow who stands where.
  }, [districtKey, plan, model]);
  const region = isRegion(districts);
  const here = region ? (districts.find((d) => d.id === district) ?? null) : null;
  const districtOfBuilding = useCallback((slug: string) => (isRegion(districts) ? (districts.find((d) => d.buildings.some((b) => b.slug === slug))?.id ?? null) : null), [districts]);
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
    () => !textShown ? [] : [
      ...(civic.hall === CIVIC_WORDS.hall && civic.post === CIVIC_WORDS.post && rooms === "classic" ? text : describeWorld(model, civic, { rooms })),
      ...saidLines(model, said, Date.now(), civic, rooms),
      ...describeCasts(castRegistry, {
        viewer: cast,
        town: town.doc.castId,
        plots: town.doc.plots,
        style: styleRegistry.getStyle(town.doc.styleId).manifest.defaultCast,
        zones: model.zones,
        buildings: model.buildings,
      }),
      ...describeZones({
        mode: model.mode,
        kept: townKeeping(town.storage, model.mode),
        zones: model.zones,
        buildings: model.buildings,
        plots: town.doc.plots,
        assignments: town.doc.assignments,
        lookOf: (zone) => [...Object.values(zone.look.styleOptions ?? {}), ...(zone.look.castId ? [castRegistry.listCasts().find((m) => m.id === zone.look.castId)?.name ?? zone.look.castId] : [])].join(", "),
      }),
      ...describePlan(plan, (slug) => model.buildings.find((b) => b.slug === slug)?.name ?? slug),
      ...describeTownDocument(town.doc, town.catalogue, { ruleProps: rules, invalidRequests: town.invalid, rooms }),
      ...(model.mode === "live" ? [{ section: "Town document", text: `The town document is ${townKeepingWords(townKeeping(town.storage, model.mode)).charAt(0).toLowerCase()}${townKeepingWords(townKeeping(town.storage, model.mode)).slice(1)}`, kind: "fact" as const }] : []),
      ...(town.storageNote ? [{ section: "Town document", text: town.storageNote, kind: "fact" as const }] : []),
    ],
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
      if (b.archived) return `${b.name} (${b.key}), archived: ${archivedWords(b.archivedAt, model.now)}${b.archivedBy ? ` by ${b.archivedBy}` : ""}. ${countsLine(b.counts)}. Enter to look inside.`;
      const lead = b.agents.find((a) => a.key === b.lead.id && a.presence === "real");
      return `${b.name} (${b.key}). ${countsLine(b.counts)}. Lead ${b.lead.displayName}, ${lead ? laneWords(lead.laneStatus, model.freshness) : "not in the building"}. Enter to go inside.`;
    },
    [buildings, model.freshness, model.now],
  );
  const enter = useCallback(
    (slug: string) => {
      const index = buildings.findIndex((b) => b.slug === slug);
      const b = buildings[index];
      if (!b) return;
      setEntered(slug);
      setDistrict(districtOfBuilding(slug));
      setFocused(index);
      setRoom(null);
      setZoomed(null);
      setSelection({ hover: null, selected: null });
      setCard(false);
      setFollowing(null);
      setAnnouncement(`Inside ${b.name} (${b.key}). ${b.agents.filter((a) => a.presence === "real").length} agents here. Escape or Backspace returns to the town.`);
    },
    [buildings, districtOfBuilding],
  );
  const describeDistrict = useCallback((d: DistrictPlace) => `${d.name}. ${summaryWords(summarise(d.buildings))}`, []);
  const back = useCallback(() => {
    setEntered(null);
    setRoom(null);
    setZoomed(null);
    setSelection({ hover: null, selected: null });
    setCard(false);
    setFollowing(null);
    // In a region a building steps out to its district; Escape once more shows the region.
    setAnnouncement(here ? `${describeDistrict(here)} Escape shows the region.` : `The town. ${describe(focused)}`);
  }, [describe, describeDistrict, focused, here]);
  const startWalk = useCallback(() => {
    walkBack.current = { entered, room, zoomed, district };
    // A walk takes the camera: a follow ends and the agent card closes.
    setFollowing(null);
    setCard(false);
    setSelection({ hover: null, selected: null });
    setRingVisible(false);
    setWalking(true);
    setAnnouncement("Walking. W A S D or the arrow keys move you, Shift hurries, drag to look around. Walk through a door to go in or out. Escape stops.");
  }, [district, entered, room, zoomed]);
  /* Escape: back to the level the walk began on. */
  const stopWalk = useCallback(() => {
    const was = walkBack.current;
    walkBack.current = null;
    setWalking(false);
    if (was) {
      setEntered(was.entered && buildings.some((b) => b.slug === was.entered) ? was.entered : null);
      setRoom(was.room);
      setZoomed(was.zoomed);
      setDistrict(was.district);
    }
    setAnnouncement("Walking stopped.");
  }, [buildings]);
  /* Goes to a place of any level (the breadcrumb, the jump list, a district's label, the text view). */
  const go = useCallback(
    (place: Place, agent?: string) => {
      // Going somewhere by name ends a walk there.
      setWalking(false);
      const b = place.building ? buildings.find((x) => x.slug === place.building) : undefined;
      const d = isRegion(districts) ? (districts.find((x) => x.id === place.district) ?? null) : null;
      setDistrict(b ? districtOfBuilding(b.slug) : (d?.id ?? null));
      setEntered(b?.slug ?? null);
      setRoom(b ? place.room : null);
      setZoomed(b ? place.room : null);
      // The agent to land beside: in its building, or in the town (the town hall's agents, the postman).
      setSelection({ hover: null, selected: agent ? { kind: "agent", key: agent } : null });
      setCard(false);
      setFollowing(null);
      if (b) {
        setFocused(buildings.indexOf(b));
        setAnnouncement(`Inside ${b.name} (${b.key})${place.room ? `, ${roomName(b, place.room, rooms)}` : ""}. Escape steps back out.`);
      } else if (d) {
        setRingVisible(false);
        setAnnouncement(`${describeDistrict(d)} Escape shows the region.`);
      } else setAnnouncement(isRegion(districts) ? `The region: ${districts.map((x) => x.name).join(", ")}.` : "The town.");
    },
    [buildings, describeDistrict, districtOfBuilding, districts, rooms],
  );
  const jump = useCallback(
    (entry: JumpEntry) => {
      setJumpOpen(false);
      // The list closes on the chosen entry (not through closeJump): the scene takes the focus, so the arrow keys and
      // Enter work at once (Enter opens the card of a figure jumped to); the body would have had it (round 21).
      requestAnimationFrame(focusScene);
      go(entry.place, entry.agent);
      if (entry.agent && !entry.place.building) {
        // A figure outside the buildings: the camera lands close beside it, selected; Enter opens its card.
        setFlight((f) => ({ id: f.id + 1, anchor: `a:town:${entry.agent}`, reach: 5 }));
        setAnnouncement(`${entry.label}. ${entry.detail} Enter opens its card.`);
      } else if (entry.civic) {
        setFlight((f) => ({ id: f.id + 1, anchor: `c:${entry.civic}` }));
        setAnnouncement(`${entry.label}. ${entry.detail}`);
      }
    },
    [go],
  );
  const openJump = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setJumpOpen(true);
  }, []);
  const closeJump = useCallback(() => {
    setJumpOpen(false);
    returnFocus.current?.focus();
  }, []);
  const jumps = useMemo(() => (jumpOpen ? jumpEntries(model, districts) : []), [jumpOpen, model, districts]);
  // A district that emptied or a town that shrank back to one settlement has no district level left.
  useEffect(() => {
    if (district && !here) setDistrict(null);
  }, [district, here]);
  const summary = useCallback(
    (kind: RoomKind) => (inside ? roomSummary(inside, kind, (a: AgentPlacement) => laneWords(a.laneStatus, model.freshness), rooms) : ""),
    [inside, model.freshness, rooms],
  );
  const focusRoom = useCallback(
    (kind: RoomKind, zoom: boolean) => {
      setRoom(kind);
      if (zoom) setZoomed(kind);
      setAnnouncement(zoom ? `${zoomedTo(summary(kind), kind, rooms)} Escape goes back to the building.` : summary(kind));
    },
    [summary, rooms],
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
      // A click on an agent selects it and opens its card; a click elsewhere (or on the selected object) clears.
      if (target?.kind === "agent") {
        setSelection((s) => ({ hover: s.hover, selected: target }));
        setCard(true);
        return;
      }
      setCard(false);
      setSelection((s) => ({ hover: s.hover, selected: target && JSON.stringify(target) !== JSON.stringify(s.selected) ? target : null }));
    },
    [focusRoom],
  );
  const selectedAgent = selection.selected?.kind === "agent" ? selection.selected.key : null;
  const agentName = useCallback(
    (key: string) => [...model.buildings.flatMap((b) => b.agents), ...model.townHall, ...model.postOffice].find((a) => a.key === key)?.displayName ?? key,
    [model],
  );
  const follow = useCallback(
    (key: string | null) => {
      setFollowing(key);
      setAnnouncement(key ? `Following ${agentName(key)}. Escape, Shift+F or a drag stops following.` : "Stopped following.");
    },
    [agentName],
  );
  // The Chat panel opens from the chip (no agent) or from a card (that agent); Escape and its close button return the
  // focus to the opener. Never in the demo, whose chat is its own scripted dock.
  const openChat = useStable((key: string | null) => {
    chatReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setChat({ agent: key ? { key, name: agentName(key) } : null });
    setAnnouncement(translate("world.chat.panel.announce"));
  });
  const closeChat = useCallback(() => {
    setChat(null);
    chatReturn.current?.focus();
  }, []);
  const placementOf = (agentId: string) => [...model.buildings.flatMap((b) => b.agents), ...model.townHall, ...model.postOffice].find((a) => a.name === agentId || a.key === agentId) ?? null;
  const answerTargetOf = useStable((a: Answer): AnswerTarget => {
    const placed = placementOf(a.agentId);
    if (model.mode === "demo") {
      const name = placed?.displayName ?? a.agentName ?? a.agentId;
      return { agent: { key: placed?.key ?? a.agentId, name }, action: `Open ${name}'s card`, note: null };
    }
    return answerTarget(a, placed ? agentCardFacts(model, worldRuntime().projection.facts, placed.key) : null);
  });
  const openAnswer = useStable((a: Answer, target: AnswerTarget) => {
    if (model.mode === "demo") pick({ kind: "agent", key: target.agent?.key ?? a.agentId }, false);
    else openChat(target.agent?.key ?? null);
  });
  /* The followed figure walked somewhere else: the level follows it; the selection and the card stay. */
  const followedTo = useCallback(
    (slug: string | null) => {
      const b = slug ? buildings.find((x) => x.slug === slug) : undefined;
      setEntered(b?.slug ?? null);
      if (b) {
        setDistrict(districtOfBuilding(b.slug));
        setFocused(buildings.indexOf(b));
      }
      setRoom(null);
      setZoomed(null);
      setAnnouncement(following ? `${agentName(following)} ${b ? `walked into ${b.name} (${b.key})` : "is walking through the town"}.` : "");
    },
    [agentName, buildings, districtOfBuilding, following],
  );
  const followStopped = useCallback(() => {
    setFollowing(null);
    setAnnouncement("Stopped following.");
  }, []);

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
  /** "Show the introduction": from Settings (which closes first, so the tour's card stands over the town) or the "?" menu. */
  const openTour = useCallback(() => {
    tourReturn.current = settingsOpen ? returnFocus.current : null;
    setSettingsOpen(false);
    setTourOpen(true);
  }, [settingsOpen]);
  const closeTour = useCallback(() => {
    writeTourDone();
    setTourOpen(false);
  }, []);
  /** The agent card closes (Escape, its close button): a focus that was in the card goes to the scene, not to the body (round 21). */
  const closeCard = useCallback(() => {
    setCard(false);
    requestAnimationFrame(() => {
      if (document.activeElement === null || document.activeElement === document.body) focusScene();
    });
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
  const openConnection = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConnectionOpen(true);
  }, []);
  const closeConnection = useCallback(() => {
    setConnectionOpen(false);
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
      // The introduction: Escape skips it wherever the focus is (the card handles it itself while the focus is inside).
      if (tourOpen && e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        closeTour();
        return;
      }
      // The jump list opens from anywhere, a text field included (Cmd or Ctrl+K types nothing).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k" && !editing) {
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
      if (editing) {
        if (e.key === "Escape") setEditing(null);
        return;
      }
      // While walking, the movement keys are the walk's (WorldCanvas), and the mode keys that share them wait.
      if (walking && /^(w|a|s|d|b|shift|arrow(up|down|left|right)|enter)$/i.test(e.key)) return;
      if (e.key.toLowerCase() === "b" && !graphicsFailed) {
        e.preventDefault();
        build.toggle();
        return;
      }
      // Escape closes the innermost thing first: Settings, then build mode (its drag, selection, chosen prop, then the
      // mode itself), then the text view, the selection, the zoomed room and the building.
      if (jumpOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeJump();
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        openJump();
        return;
      }
      if (e.key === "Escape" && chat) {
        e.preventDefault();
        closeChat();
        return;
      }
      if (e.key === "Escape" && connectionOpen) {
        e.preventDefault();
        closeConnection();
        return;
      }
      if (e.key === "Escape" && settingsOpen) {
        e.preventDefault();
        closeSettings();
        return;
      }
      if (build.key(e)) {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape" && walking) {
        e.preventDefault();
        stopWalk();
        return;
      }
      if (e.key.toLowerCase() === "w" && !graphicsFailed && !build.state.on && !textOpen && !settingsOpen && !selection.selected) {
        e.preventDefault();
        startWalk();
        return;
      }
      if (e.key === "Escape" && build.state.on) {
        e.preventDefault();
        build.toggle();
        return;
      }
      // Shift+F follows the selected agent (F alone is the frame rate overlay).
      if (e.key.toLowerCase() === "f" && e.shiftKey && !graphicsFailed && (selectedAgent || following)) {
        e.preventDefault();
        follow(following ? null : selectedAgent);
        return;
      }
      if (e.key === "Escape") {
        if (textOpen) closeText();
        else if (following) follow(null);
        else if (card) closeCard();
        else if (selection.selected) setSelection((s) => ({ ...s, selected: null }));
        else if (zoomed) {
          setZoomed(null);
          setAnnouncement(`Inside ${inside?.name ?? "the building"}. Arrow keys move between ${rooms === "classic" ? "rooms" : "the halls"}.`);
        } else if (entered) back();
        else if (here) go(stepOut({ district: here.id, building: null, room: null })!);
        else return;
        e.preventDefault();
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
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [back, build, camera, card, chat, closeCard, closeChat, closeConnection, closeJump, closeSettings, closeText, closeTour, connectionOpen, editing, entered, follow, following, go, graphicsFailed, here, inside, jumpOpen, openJump, openText, redo, rooms, selectedAgent, selection.selected, settingsOpen, startWalk, stopWalk, textOpen, tourOpen, undo, walking, zoomed]);

  // Arrow keys and Enter move the focus ring between plots while the scene has keyboard focus.
  const sceneKey = (e: ReactKeyboardEvent) => {
    if (typing(e.target) || e.altKey || e.ctrlKey || e.metaKey || walking) return;
    // Build mode moves the chosen or selected prop with the arrow keys (the window listener handles them).
    if (build.state.on && inside && (build.state.propId || build.state.selected)) return;
    if (inside) {
      // Inside a building: arrow keys move the focus ring between rooms, Enter zooms to the focused room.
      const onCanvas = e.target === e.currentTarget.querySelector("canvas");
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const template = buildingTemplate(inside, rooms);
        focusRoom(room ? roomNeighbor(template, room, e.key) : firstRoom(template), false);
      } else if (e.key === "Enter" && onCanvas) {
        e.preventDefault();
        // Enter on a selected agent opens its card; else it zooms to the focused room.
        if (selectedAgent && !card) setCard(true);
        else focusRoom(room ?? firstRoom(buildingTemplate(inside, rooms)), true);
      }
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      // The ring moves by where the buildings stand, not by their order in the list.
      const next = ringVisible ? moveFocus(plan, buildings.map((b) => b.slug), focused, e.key) : focused;
      setFocused(next);
      setRingVisible(true);
      setAnnouncement(describe(next));
    }
    if (e.key === "Enter" && e.target === e.currentTarget.querySelector("canvas")) {
      e.preventDefault();
      // Enter on a selected town figure (after a jump to it) opens its card; else it enters the focused building.
      if (selectedAgent && !card) {
        setCard(true);
        return;
      }
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
  const connection = useConnection();
  // A change of the connection's state (Live, Loops down, Catching up, Stream busy, back to Live) is said once in the live
  // region: the chip changes its word, and a screen reader would otherwise hear nothing. Not the first value on load.
  const spokenConnection = useRef<ConnectionState | null>(null);
  useEffect(() => {
    if (spokenConnection.current !== null && connection !== null && spokenConnection.current !== connection)
      setAnnouncement(translate("world.connection.changed", { state: connectionWord(connection), hint: translate(`world.connection.hint.${connection}`) }));
    spokenConnection.current = connection;
  }, [connection]);
  // The host's health as the Pair screen last saw it (the gate's read first); the screen polls and keeps it fresh.
  const [health, setHealth] = useState<HostHealth>(() => SOURCE.health ?? { loops: "ok", keyName: "", sharedKey: false, pairing: "on", paired: false });
  // The text view's Chat line and the Chat panel's small print say the chat session's state (round 14): one health read
  // when either opens on a live page, so the words are the host's current ones, not the gate's first read.
  const chatOpen = chat !== null;
  useEffect(() => {
    if (demo || !(textOpen || chatOpen)) return;
    let live = true;
    void probeHost("", 1500).then((fresh) => {
      if (live && fresh !== null) rememberHealth(fresh);
    });
    return () => {
      live = false;
    };
  }, [demo, textOpen, chatOpen]);
  // Road 2 of the chat (round 28, state/pageChat.ts): on a live page whose host's key does not read the chat, the page
  // asks crewhub-loops itself at the origin the host names, and polls the person's own conversation when loops lets this
  // origin read it; the lines go to the said store like the host's. Restarted when the host's word changes.
  const pageChatOrigin = demo ? null : loopsOriginOf(hostHealth);
  const keyReadsChat = hostKeyReadsChat(hostHealth);
  useEffect(() => {
    if (pageChatOrigin === null) return;
    return startPageChat({ loopsOrigin: pageChatOrigin, hostKeyReadsChat: keyReadsChat });
  }, [pageChatOrigin, keyReadsChat]);
  const onGo = useStable(go);
  const trailNames = { home: homeName(districts), district: here?.name ?? null, building: inside?.name ?? null, room: inside && zoomed ? roomName(inside, zoomed, rooms) : null };
  const trail = useMemo(
    () => crumbs({ district: here?.id ?? null, building: inside?.slug ?? null, room: inside ? zoomed : null }, trailNames),
    // The names decide; the object is new each render.
    [here?.id, inside?.slug, zoomed, JSON.stringify(trailNames)],
  );

  // Unpaired (state/connect.ts `liveScreen`): the host answered 401 not_paired after the town was up (a host restarted
  // without its pairing secret, or the cookie gone). The Pair screen stands in for the town until the source, which keeps
  // asking every couple of seconds, is live again with the new link's cookie; then the town comes back by itself.
  // Unauthorized or loops down: the host's own word on its key says what it is (none after a Forget in another tab: the
  // Connect screen; rejected: the rejected screen). The stream's status carries that word since round 11 and is preferred
  // over the health read; a host from before says nothing, so while the source says so and no screen shows yet, the health
  // is read again every few seconds (the Connect page reads it itself once it shows).
  const streamKey = useConnectionKey();
  // The host's word can change after the page's first read (round 29, Medium 2): the stream going live, or the host's
  // key word on its status (a key checked late, accepted on the stream, forgotten in another tab). Health is read
  // again then, so the road follows the host's real word and the road-2 runner restarts on it.
  const rereadOn = healthRereadKey(connection, streamKey);
  useEffect(() => {
    if (demo || rereadOn === null) return;
    let live = true;
    void probeHost("", 1500).then((fresh) => {
      if (live && fresh !== null) rememberHealth(fresh);
    });
    return () => {
      live = false;
    };
  }, [demo, rereadOn]);
  const screen = demo ? null : liveScreen(connection, withStreamKey(health, streamKey));
  const degraded = !demo && streamKey === null && (connection === "unauthorized" || connection === "loops-down") && screen === null;
  useEffect(() => {
    if (!degraded) return;
    let live = true;
    const ask = async () => {
      const fresh = await probeHost("", 1500);
      if (live && fresh !== null) setHealth(fresh);
    };
    void ask();
    const timer = setInterval(() => void ask(), CONNECT_POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [degraded]);
  // The tour starts by itself once the town stands (a short beat after the model has buildings, or at once in the demo),
  // never over a Connect screen, a dialog or a failed scene, never for a tool's browser, never again after Skip or Done.
  const dialogOpen = settingsOpen || jumpOpen || connectionOpen || chat !== null || card || textOpen || build.state.on || editing !== null;
  const townStands = demo || model.buildings.length > 0;
  useEffect(() => {
    if (tourAsked.current || !townStands || screen !== null) return;
    const timer = setTimeout(() => {
      if (tourAsked.current) return;
      tourAsked.current = true;
      if (tourShouldStart({ done: readTourDone(), webdriver: navigator.webdriver === true, search: location.search, screenShown: screen !== null, dialogOpen, graphicsFailed })) setTourOpen(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [townStands, screen, dialogOpen, graphicsFailed]);
  if (screen !== null) return <ConnectPage screen={screen} health={health} onHealth={setHealth} />;

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
            <WorldCanvas
              model={model}
              said={said}
              onSaidTap={(key) => (demo ? pick({ kind: "agent", key }, false) : openChat(key))}
              marks={marks}
              plan={plan}
              entered={entered}
              focused={focused}
              likely={likely}
              ringVisible={ringVisible}
              room={room}
              zoomed={zoomed}
              selection={selection}
              onPick={pick}
              reducedMotion={reducedMotion}
              ambient={ambient}
              details={details}
              action={action}
              districts={districts}
              district={here?.id ?? null}
              flight={flight}
              onDistrict={(id) => onGo({ district: id, building: null, room: null })}
              onEnter={enter}
              onHover={hover}
              onError={() => setGraphicsFailed(true)}
              onAnnounce={setAnnouncement}
              town={townLayer}
              onBuild={build.pointer}
              walking={walking}
              onWalkPlace={(slug) => (slug ? enter(slug) : back())}
              card={card}
              onCloseCard={closeCard}
              onChat={demo ? null : openChat}
              following={following}
              onFollow={follow}
              onFollowed={followedTo}
              onFollowStopped={followStopped}
            />
          </SceneBoundary>
        )}
        {!demo && connection === "connecting" && <FirstSnapshot />}
      </main>

      <Corner demo={demo} connection={connection} connectionOpen={connectionOpen} onOpenConnection={openConnection} graphicsFailed={graphicsFailed} trail={trail} onGo={onGo} onJump={openJump} jumpOpen={jumpOpen} following={following ? agentName(following) : null} onStopFollow={() => follow(null)} />

      {connectionOpen && connection && <ConnectionPanel state={connection} initial={SOURCE.health} onClose={closeConnection} />}

      {chat && !demo && <ChatPanel agent={chat.agent} health={hostHealth} road={chatRoad} full={narrow} answers={answers} recentEmpty={recentEmptyWords("live", chatRoad)} targetOf={answerTargetOf} onAnswer={openAnswer} onClose={closeChat} />}

      {jumpOpen && <JumpList entries={jumps} onJump={jump} onClose={closeJump} onActive={jumpActive} />}

      <CornerTools theme={theme} cycle={cycle} details={details} buildOn={build.state.on} toggleBuild={build.toggle} settingsOpen={settingsOpen} openSettings={openSettings} closeSettings={closeSettings} graphicsFailed={graphicsFailed} openTour={openTour} />

      {tourOpen && <Tour mode={demo ? "demo" : "live"} reducedMotion={reducedMotion} returnTo={tourReturn.current} onClose={closeTour} />}

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

      {!graphicsFailed && <CameraToolbar camera={camera} walking={walking} toggleWalk={walking ? stopWalk : build.state.on ? null : startWalk} />}

      <ChatCorner narrow={narrow} demo={demo} connection={connection} chatOpen={chat !== null} onOpenChat={() => openChat(null)} />

      {playback && <PlaybackBar playback={playback} />}

      {(textOpen || graphicsFailed) && <TextView civic={civic} rooms={rooms} ref={textRegion} lines={textLines} connection={connection} chat={chatPlaceLine(demo ? "demo" : "live", chatRoad)} marks={marks} answers={answers} recentEmpty={recentEmptyWords(demo ? "demo" : "live", chatRoad)} targetOf={answerTargetOf} onAnswer={openAnswer} fallback={graphicsFailed} onClose={graphicsFailed ? null : closeText} districts={districts} onGo={graphicsFailed ? null : onGo} />}
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
const SCENARIO_CHOICES = scenarioChoices();

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
        {demo && (
          <Menu
            name="Demo scenario"
            className="demo-menu"
            initialFocus="checked"
            trigger={{
              variant: "chip",
              className: "demo-chip",
              icon: <FlaskConical className="icon" aria-hidden="true" />,
              label: <span className="demo-word">Demo: {scenario}</span>,
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
}) {
  const { theme, cycle, details, buildOn, toggleBuild, settingsOpen, openSettings, closeSettings, graphicsFailed, openTour } = props;
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
  const sections = new Map<string, TextLine[]>();
  for (const line of lines) sections.set(line.section, [...(sections.get(line.section) ?? []), line]);
  // The town first, then every building's sections under its district, then the rest (casts, zones, the town document).
  const region = isRegion(districts);
  const names = [...sections.keys()];
  const owned = (b: { name: string; key: string }) => names.filter((n) => n === `${b.name} (${b.key})` || n.startsWith(`${b.name} (${b.key}): `));
  const placed = new Set(districts.flatMap((d) => d.buildings.flatMap(owned)));
  const before = names.filter((n) => !placed.has(n) && n === "Town"),
    after = names.filter((n) => !placed.has(n) && n !== "Town");
  const block = (section: string, level: 3 | 4) => {
    const Heading = `h${level}` as "h3" | "h4";
    return (
      <section key={section} className="text-section">
        <Heading>{section}</Heading>
        <ul>
          {sections.get(section)!.map((line, i) => (
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
        {before.map((section) => block(section, 3))}
        {districts.map((d) => {
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
              {d.buildings.map((b) => {
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
                    {owned(b).map((section) => block(section, 4))}
                  </div>
                );
              })}
            </section>
          );
        })}
        {after.map((section) => block(section, 3))}
        <DirectorLog />
      </Card.Body>
    </Card>
  );
}
