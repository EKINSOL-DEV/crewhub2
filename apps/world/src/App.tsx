import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type Ref } from "react";
import { ArrowLeft, ChevronRight, Eye, FlaskConical, Hammer, MessageCircle, Minus, Monitor, Moon, Pause, Plus, RotateCcw, RotateCw, Footprints, Scan, Search, Settings, Sprout, Sun, Tags, X } from "lucide-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { CIVIC_WORDS, describeTownDocument, describeWorld, ruleProps, zoningOf, type AgentPlacement, type CivicWords, type PlaybackControls, type PlaybackSpeed, type RoleId, type RoomKind, type TextLine, type WorldModel } from "@crewhub/world-model";
import type { PropModel } from "@crewhub/world-engine";
import { Bubbles } from "./components/bubbles/Bubbles";
import { TownSettings } from "./components/TownSettings";
import { SourceSettings } from "./components/SourceSettings";
import { ConnectionChip, connectionLine } from "./components/ConnectionChip";
import { JumpList } from "./components/JumpList";
import { IconSprite } from "./components/Icon";
import { Button, Card, Chip, Field, Menu } from "./components/primitives";
import { SceneBoundary } from "./components/SceneBoundary";
import type { Selection } from "./components/WorldCanvas";
import { createChatQueryClient, useChatEvents, useChatNavigation, useChatView } from "./state/chat";
import { useAmbient } from "./state/ambient";
import { useCast } from "./state/cast";
import { castRegistry } from "./world/cast";
import { describeCasts } from "./world/castText";
import { describeZones } from "./world/zoneText";
import { styleRegistry } from "./world/style";
import { crumbs, districtsOf, homeName, isRegion, jumpEntries, needsOf, needsWords, stepOut, summarise, summaryWords, type Crumb, type DistrictPlace, type JumpEntry, type Place } from "./world/wayfinding";
import { toggleDetails, useDetails } from "./state/details";
import { toggleFps } from "./state/fps";
import { readRoleOverrides, writeRoleOverrides } from "./state/roleOverrides";
import { useBuildMode } from "./state/build";
import { useDark, useTheme } from "./state/theme";
import { townRuntime, useTown } from "./state/town";
import type { TownLayer } from "./world/propLayer";
import { scenarioChoices, SOURCE, useConnection, useWorld, worldRuntime } from "./state/world";
import { loopsWebUrl } from "./state/source";
import { translate } from "./i18n";
import type { ConnectionState } from "@crewhub/loops-client";
import { buildingTemplate } from "./world/buildingTemplate";
import type { Pick } from "./world/buildingView";
import { firstRoom, roomName, roomNeighbor, roomSummary } from "./world/interiorLayout";
import { DirectorLog } from "./components/DirectorLog";
import { PresenceSettings } from "./components/PresenceSettings";
import { WhereForm } from "./components/WhereForm";
import { civicWords } from "./world/settlementDressing";
import { useDirectorFeed } from "./state/director";
import type { CameraAction } from "./world/TownScene";
import { countsLine, laneWords, mmss } from "./world/townLayout";
import { describePlan, moveFocus } from "./world/townPlan";
import { useTownPlan } from "./state/plan";

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
  // The district the view is in (a region only): the level between the home view and a building.
  const [district, setDistrict] = useState<string | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [flight, setFlight] = useState<{ id: number; anchor: string }>({ id: 0, anchor: "" });
  const [selection, setSelection] = useState<Selection>({ hover: null, selected: null });
  // Walk mode: the person walks a visitor through the world. The level it began on is kept for the way back.
  const [walking, setWalking] = useState(false);
  const walkBack = useRef<{ entered: string | null; room: RoomKind | null; zoomed: RoomKind | null; district: string | null } | null>(null);
  // The agent card (open for the selected agent) and the agent the camera follows (components/AgentCard).
  const [card, setCard] = useState(false);
  const [following, setFollowing] = useState<string | null>(null);
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
  // The civic places go by what stands there at this size: the lodge, the mailbox, the mail hut.
  const civic = useMemo(() => civicWords(plan.civic), [plan.civic.hall, plan.civic.post]);
  // Only while the text view shows: describing a region on every model update is felt on a phone.
  const textShown = textOpen || graphicsFailed;
  const textLines = useMemo(
    () => !textShown ? [] : [
      ...(civic.hall === CIVIC_WORDS.hall && civic.post === CIVIC_WORDS.post ? text : describeWorld(model, civic)),
      ...describeCasts(castRegistry, {
        viewer: cast,
        town: town.doc.castId,
        plots: town.doc.plots,
        style: styleRegistry.getStyle(town.doc.styleId).manifest.defaultCast,
        zones: model.zones,
        buildings: model.buildings,
      }),
      ...describeZones({
        zones: model.zones,
        buildings: model.buildings,
        plots: town.doc.plots,
        assignments: town.doc.assignments,
        lookOf: (zone) => [...Object.values(zone.look.styleOptions ?? {}), ...(zone.look.castId ? [castRegistry.listCasts().find((m) => m.id === zone.look.castId)?.name ?? zone.look.castId] : [])].join(", "),
      }),
      ...describePlan(plan, (slug) => model.buildings.find((b) => b.slug === slug)?.name ?? slug),
      ...describeTownDocument(town.doc, town.catalogue, { ruleProps: rules, invalidRequests: town.invalid }),
    ],
    [textShown, text, civic, cast, town.doc, town.catalogue, rules, town.invalid, model.zones, model.buildings, plan],
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
      setSelection({ hover: null, selected: b && agent ? { kind: "agent", key: agent } : null });
      setCard(false);
      setFollowing(null);
      if (b) {
        setFocused(buildings.indexOf(b));
        setAnnouncement(`Inside ${b.name} (${b.key})${place.room ? `, ${roomName(b, place.room)}` : ""}. Escape steps back out.`);
      } else if (d) {
        setRingVisible(false);
        setAnnouncement(`${describeDistrict(d)} Escape shows the region.`);
      } else setAnnouncement(isRegion(districts) ? `The region: ${districts.map((x) => x.name).join(", ")}.` : "The town.");
    },
    [buildings, describeDistrict, districtOfBuilding, districts],
  );
  const jump = useCallback(
    (entry: JumpEntry) => {
      setJumpOpen(false);
      go(entry.place, entry.agent);
      if (entry.civic) {
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
      // The jump list opens from anywhere, a text field included (Cmd or Ctrl+K types nothing).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k" && !editing) {
        e.preventDefault();
        if (jumpOpen) closeJump();
        else openJump();
        return;
      }
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
        else if (card) setCard(false);
        else if (selection.selected) setSelection((s) => ({ ...s, selected: null }));
        else if (zoomed) {
          setZoomed(null);
          setAnnouncement(`Inside ${inside?.name ?? "the building"}. Arrow keys move between rooms.`);
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
  }, [back, build, camera, card, closeJump, closeSettings, closeText, editing, entered, follow, following, go, graphicsFailed, here, inside, jumpOpen, openJump, openText, redo, selectedAgent, selection.selected, settingsOpen, startWalk, stopWalk, textOpen, undo, walking, zoomed]);

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
        const template = buildingTemplate(inside);
        focusRoom(room ? roomNeighbor(template, room, e.key) : firstRoom(template), false);
      } else if (e.key === "Enter" && onCanvas) {
        e.preventDefault();
        // Enter on a selected agent opens its card; else it zooms to the focused room.
        if (selectedAgent && !card) setCard(true);
        else focusRoom(room ?? firstRoom(buildingTemplate(inside)), true);
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
  const onGo = useStable(go);
  const trailNames = { home: homeName(districts), district: here?.name ?? null, building: inside?.name ?? null, room: inside && zoomed ? roomName(inside, zoomed) : null };
  const trail = useMemo(
    () => crumbs({ district: here?.id ?? null, building: inside?.slug ?? null, room: inside ? zoomed : null }, trailNames),
    // The names decide; the object is new each render.
    [here?.id, inside?.slug, zoomed, JSON.stringify(trailNames)],
  );

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
                plan={plan}
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
                onCloseCard={() => setCard(false)}
                following={following}
                onFollow={follow}
                onFollowed={followedTo}
                onFollowStopped={followStopped}
              />
            </Suspense>
          </SceneBoundary>
        )}
      </main>

      <Corner demo={demo} connection={connection} graphicsFailed={graphicsFailed} trail={trail} onGo={onGo} onJump={openJump} jumpOpen={jumpOpen} following={following ? agentName(following) : null} onStopFollow={() => follow(null)} />

      {jumpOpen && <JumpList entries={jumps} onJump={jump} onClose={closeJump} />}

      <CornerTools theme={theme} cycle={cycle} details={details} buildOn={build.state.on} toggleBuild={build.toggle} settingsOpen={settingsOpen} openSettings={openSettings} closeSettings={closeSettings} graphicsFailed={graphicsFailed} />

      {settingsOpen && (
        <Card ref={settingsCard} className="world-sheet settings-sheet" role="dialog" aria-labelledby="settings-title">
          <Card.Header
            title="Settings"
            titleId="settings-title"
            action={<Button variant="ghost" size="sm" iconOnly aria-label="Close settings" icon={<X className="icon" aria-hidden="true" />} onClick={closeSettings} />}
          />
          <Card.Body>
            <SourceSettings />
            <RoleSettings model={model} overrides={overrides} onChange={setOverrides} />
            <TownSettings town={town} />
            <p className="sign-muted">{translate(demo ? "world.settings.agentsDemo" : "world.settings.agentsLive")}</p>
            <PresenceSettings reducedMotion={reducedMotion} />
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

      <ChatCorner narrow={narrow} demo={demo} connection={connection} />

      {playback && <PlaybackBar playback={playback} />}

      {(textOpen || graphicsFailed) && <TextView civic={civic} ref={textRegion} lines={textLines} connection={connection} fallback={graphicsFailed} onClose={graphicsFailed ? null : closeText} districts={districts} onGo={graphicsFailed ? null : onGo} />}
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
const SCENARIO_CHOICES = scenarioChoices();

const Corner = memo(function Corner({
  demo,
  connection,
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
    <header className="world-corner world-corner-left">
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
        {!demo && connection && <ConnectionChip state={connection} />}
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

const CameraToolbar = memo(function CameraToolbar({ camera, walking, toggleWalk }: { camera: (type: CameraAction) => void; walking: boolean; toggleWalk: (() => void) | null }) {
  return (
    <div className="camera-toolbar" role="toolbar" aria-label="Camera">
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

/* In demo mode the copied dock and its "replies are scripted" note; in live mode the plan's sign-in link to the loops web
   app instead (the world's own chat is phase 2; a session cookie never reaches the world). */
const ChatCorner = memo(function ChatCorner({ narrow, demo, connection }: { narrow: boolean; demo: boolean; connection: ConnectionState | null }) {
  if (!demo)
    return (
      <div className="world-chat">
        <Chip className="demo-chat-chip chat-sign-in" href={loopsWebUrl(SOURCE.health)} title={translate("world.chat.signInHint")} data-connection={connection ?? undefined} icon={<MessageCircle className="icon" aria-hidden="true" />}>
          {translate("world.chat.signIn")}
        </Chip>
      </div>
    );
  return (
    <div className="world-chat">
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
    <section className="playback-bar" aria-label="Demo playback">
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

function TextView({ lines, civic, connection, fallback, onClose, districts, onGo, ref }: { lines: TextLine[]; civic: CivicWords; connection: ConnectionState | null; fallback: boolean; onClose: (() => void) | null; districts: DistrictPlace[]; onGo: ((place: Place) => void) | null; ref: Ref<HTMLElement> }) {
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
        <WhereForm civic={civic} />
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
