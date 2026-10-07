import { memo, useCallback, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Archive, Check, CircleHelp, Clock, Flag, Hand, MessageSquare, Play, RefreshCw, Sprout, TriangleAlert, Trophy } from "lucide-react";
import { agentCardFacts, type AgentPlacement, type Building, type ProgressKind, type RoleSource, type WorkObject, type WorldModel } from "@crewhub/world-model";
import { SOURCE, STRESS, worldRuntime } from "../state/world";
import { loopsWebUrl } from "../state/source";
import { AgentCard } from "./AgentCard";
import { renderAgentCard } from "../world/agentCard/registry";
import { useDark } from "../state/theme";
import { useQuality } from "../state/quality";
import { useCast } from "../state/cast";
import { useStyleOptions } from "../state/styleOptions";
import { useDayNight } from "../state/daynight";
import { useFps } from "../state/fps";
import { FpsOverlay } from "./FpsOverlay";
import type { Pick } from "../world/buildingView";
import { buildingTemplate } from "../world/buildingTemplate";
import { assignDesks, placeObjects, roomName, shortRoomName } from "../world/interiorLayout";
import { hallName, isThreeRoom, RACKS } from "../world/roomDressing";
import { TownScene, type BuildPointer, type CameraAction, type FrameStats } from "../world/TownScene";
import { resolveBuildingPlacements } from "../world/placements";
import type { TownLayer } from "../world/propLayer";
import type { Ambient } from "../world/movement";
import { keysDirection } from "../world/visitor";
import { LaneChip } from "../world/lane";
import { clockTime, countsLine, laneWords } from "../world/townLayout";
import { civicLabel, civicWords } from "../world/settlementDressing";
import { freeLots, type TownPlan } from "../world/townPlan";
import { lotKey } from "../world/settlement";
import { setMovingBuilding, useMovingBuilding } from "../state/layoutMove";
import { moveBuilding, plotLabel } from "./LayoutPanel";
import { townRuntime } from "../state/town";
import type { LaneStatus, RoomKind, RuleProp } from "@crewhub/world-model";
import { Chip } from "./primitives";
import { needsOf, needsTotal, needsWords, summarise, summaryWords, activeWords, type DistrictPlace } from "../world/wayfinding";

export interface Selection {
  hover: Pick | null;
  selected: Pick | null;
}

interface Props {
  model: WorldModel;
  /** Where every building stands (state/plan.ts). */
  plan: TownPlan;
  entered: string | null;
  focused: number;
  ringVisible: boolean;
  room: RoomKind | null;
  zoomed: RoomKind | null;
  selection: Selection;
  reducedMotion: boolean;
  ambient: Ambient;
  /** Every label, not only names and one bubble per robot (the Details toggle). */
  details: boolean;
  action: { id: number; type: CameraAction };
  /** The districts in use (one for a single settlement) and the one the view is in, if any. */
  districts: DistrictPlace[];
  district: string | null;
  /** A camera flight to a label anchor (the jump list's civic buildings). */
  flight: { id: number; anchor: string };
  onDistrict: (id: string) => void;
  onEnter: (slug: string) => void;
  onHover: (index: number | null) => void;
  onPick: (target: Pick | null, hover: boolean) => void;
  onError: () => void;
  town: TownLayer | null;
  /** The agent card is open for the selected agent (components/AgentCard). */
  card: boolean;
  onCloseCard: () => void;
  /** The agent the camera follows, or null. */
  following: string | null;
  onFollow: (key: string | null) => void;
  /** The followed figure walked into the town (null) or a building: the app sets the level. */
  onFollowed: (building: string | null) => void;
  /** The follow ended in the scene (a drag, the figure left). */
  onFollowStopped: () => void;
  /** Says something on the polite status line (a building moved). */
  onAnnounce?: (text: string) => void;
  onBuild: (kind: BuildPointer, at: { room: RoomKind; cell: { x: number; z: number } } | null, pick: Pick | null) => void;
  /** Walk mode: the person walks a visitor through the world; a front door crossed reports the building (or null for the town). */
  walking: boolean;
  onWalkPlace: (slug: string | null) => void;
}

/* Above this many buildings, Details leaves the town's signs as quiet names (only the focused one expands). */
const QUIET_TOWN = 6;
const now = () => worldRuntime().source.now();
/* The live source has no playback: it runs at the wall clock, 1x. */
const speed = () => worldRuntime().source.playback?.speed() ?? 1;
const dayClock = () => worldRuntime().source.now() - worldRuntime().epochMs;

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches("input, select, textarea") || target.isContentEditable);
const WALK_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

/**
 * Walk mode's input: W A S D or the arrow keys (Shift hurries), and a virtual stick where there is no keyboard (a
 * coarse pointer or a narrow screen; CSS decides). It only tells the scene which way is wanted; the scene walks.
 */
function WalkControls({ scene }: { scene: RefObject<TownScene | null> }) {
  const stick = useRef<HTMLDivElement>(null),
    knob = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const held = new Set<string>();
    let hurry = false;
    const send = () => {
      const d = keysDirection(held);
      const length = Math.hypot(d.x, d.y) || 1;
      scene.current?.walkInput(d.x / length, d.y / length, hurry);
    };
    const key = (e: KeyboardEvent) => {
      const down = e.type === "keydown";
      if (e.key === "Shift") hurry = down;
      else {
        const name = e.key.toLowerCase();
        if (!WALK_KEYS.has(name)) return;
        if (down && (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey)) return;
        if (down) {
          held.add(name);
          // The arrow keys would scroll a sheet or move the focus ring.
          e.preventDefault();
        } else held.delete(name);
      }
      send();
    };
    const release = () => {
      held.clear();
      hurry = false;
      send();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", release);
      scene.current?.walkInput(0, 0, false);
    };
  }, [scene]);
  const push = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = stick.current;
    if (!el || (e.type === "pointermove" && !el.hasPointerCapture(e.pointerId))) return;
    if (e.type === "pointerdown") el.setPointerCapture(e.pointerId);
    const box = el.getBoundingClientRect();
    const radius = box.width / 2;
    let x = (e.clientX - box.left - radius) / radius,
      y = (e.clientY - box.top - radius) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    if (knob.current) knob.current.style.transform = `translate(${(x * radius * 0.6).toFixed(1)}px, ${(y * radius * 0.6).toFixed(1)}px)`;
    scene.current?.walkInput(x, -y, false);
  };
  const rest = () => {
    if (knob.current) knob.current.style.transform = "";
    scene.current?.walkInput(0, 0, false);
  };
  return (
    <div ref={stick} className="walk-stick" role="application" aria-label="Walk: drag to move" onPointerDown={push} onPointerMove={push} onPointerUp={rest} onPointerCancel={rest} onLostPointerCapture={rest}>
      <span ref={knob} className="walk-knob" aria-hidden="true" />
    </div>
  );
}

/** The Three.js town and its HTML labels. Labels carry words for every fact they show; the scene only positions them. */
export default function WorldCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLDivElement>(null);
  const scene = useRef<TownScene | null>(null),
    latest = useRef(props);
  const [ready, setReady] = useState(false);
  const dark = useDark();
  const quality = useQuality();
  const cast = useCast();
  const styleOptions = useStyleOptions();
  const dayNight = useDayNight(props.model.mode);
  const fps = useFps();
  latest.current = props;
  // Which buildings stand in which district: the scene frames a district and hangs its label from this.
  const districtKey = props.districts.map((d) => `${d.id}:${d.buildings.map((b) => b.slug).join(",")}`).join("|");
  const districtViews = useMemo(() => props.districts.map((d) => ({ id: d.id, slugs: d.buildings.map((b) => b.slug) })), [districtKey]);
  // The ghost's verdict tile takes the scene's theme.
  const town = useMemo(
    () => (props.town?.build ? { ...props.town, build: { ...props.town.build, theme: dark ? ("lamplight" as const) : ("day" as const) } } : props.town),
    [props.town, dark],
  );
  // A building picked up in build mode: its free plots show as markers in the town view.
  const moving = useMovingBuilding();
  const movingBuilding = !props.entered && moving ? (props.model.buildings.find((b) => b.slug === moving) ?? null) : null;
  const plots = props.town?.doc.plots;
  const free = useMemo(() => (movingBuilding && plots ? freeLots(props.plan, plots) : []), [movingBuilding, props.plan, plots]);
  const lotAnchors = useMemo(() => free.map((l) => l.cell), [free]);
  const view = {
    model: props.model,
    plan: props.plan,
    lotAnchors,
    entered: props.entered,
    focused: props.focused,
    ringVisible: props.ringVisible,
    room: props.room,
    zoomed: props.zoomed,
    reducedMotion: props.reducedMotion,
    theme: dark ? ("lamplight" as const) : ("day" as const),
    quality,
    cast,
    styleOptions,
    now,
    dayNight,
    dayClock,
    town,
    speed,
    ambient: props.ambient,
    measure: STRESS,
    fps,
    selectedAgent: props.selection.selected?.kind === "agent" ? props.selection.selected.key : null,
    districts: districtViews,
    district: props.district,
    walking: props.walking,
  };
  useEffect(() => {
    if (!host.current || !labels.current) return;
    try {
      scene.current = new TownScene(host.current, labels.current, view, {
        enter: (slug) => latest.current.onEnter(slug),
        hover: (index) => latest.current.onHover(index),
        pick: (target, hover) => latest.current.onPick(target, hover),
        error: () => latest.current.onError(),
        build: (kind, at, pick) => latest.current.onBuild(kind, at, pick),
        followed: (building) => latest.current.onFollowed(building),
        followStopped: () => latest.current.onFollowStopped(),
        // The town lays itself out over a few tasks; the loading note stays until it is done.
        ready: () => setReady(true),
        walkPlace: (slug) => latest.current.onWalkPlace(slug),
      });
    } catch {
      latest.current.onError();
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
    // The scene lives as long as the component; later views go through setView.
  }, []);
  // After every render: the labels in the DOM may have changed.
  useLayoutEffect(() => {
    scene.current?.setView(view);
  });
  useEffect(() => {
    if (props.action.id) scene.current?.cameraAction(props.action.type);
  }, [props.action]);
  useEffect(() => {
    if (props.flight.id) scene.current?.flyToAnchor(props.flight.anchor);
  }, [props.flight]);
  useEffect(() => {
    scene.current?.follow(props.following);
  }, [props.following, ready]);
  const portrait = useCallback((canvas: HTMLCanvasElement) => scene.current?.portrait(latest.current.selection.selected?.kind === "agent" ? latest.current.selection.selected.key : "", canvas) ?? false, []);

  const { model, entered } = props;
  const inside = model.buildings.find((b) => b.slug === entered) ?? null;
  const compact = useCompact();
  const card = useAgentCard(props, inside, compact, portrait);
  const go = useRef({ onEnter: props.onEnter, onHover: props.onHover });
  go.current = { onEnter: props.onEnter, onHover: props.onHover };
  return (
    <>
      <div ref={host} className="canvas-host" />
      {!ready && (
        <div className="room-loading">
          <Sprout size={28} aria-hidden="true" />
          <span>Laying out the town…</span>
        </div>
      )}
      {STRESS && ready && <FrameOverlay scene={scene} />}
      {inside && compact && card && card.element}
      {fps && ready && <FpsOverlay scene={scene} />}
      {props.walking && ready && <WalkControls scene={scene} />}
      <div ref={labels} className="world-labels">
        {props.walking && (
          <div className="anchor agent-anchor picked" data-anchor="you">
            <span className="agent-stack">
              <span className="name-pill you-pill">You</span>
            </span>
          </div>
        )}
        {movingBuilding &&
          free.map((lot) => (
            <div key={`lot:${lotKey(lot.cell)}`} className="anchor raised" data-anchor={`lot:${lotKey(lot.cell)}`}>
              <button
                type="button"
                className={`lot-marker${lot.next ? " next" : ""}`}
                aria-label={`Move ${movingBuilding.name} to ${plotLabel(lot, model.zones)}${lot.next ? " (next free)" : ""}`}
                title={`Move ${movingBuilding.name} here: ${plotLabel(lot, model.zones)}`}
                onClick={() => {
                  latest.current.onAnnounce?.(moveBuilding(townRuntime().state, movingBuilding, lot, model.zones));
                  setMovingBuilding(null);
                }}
              >
                {lot.number}
              </button>
            </div>
          ))}
        {model.buildings.map((b, index) => {
          if (inside && inside.slug !== b.slug) return null;
          // Inside, the breadcrumb names the building: its sign comes back with Details (small on a phone). In the town a
          // sign is a quiet name until the focus ring or Details expands it with its counts and its lead.
          if (inside && !props.details) return null;
          // With Details on, a town of more than a few buildings keeps its signs quiet (a wall of cards hides the town):
          // the focused one still expands.
          const expanded = inside ? !compact : (props.ringVisible && props.focused === index) || (props.details && model.buildings.length <= QUIET_TOWN);
          const lead = expanded && !b.archived ? b.agents.find((a) => a.key === b.lead.id && a.presence === "real") : undefined;
          return (
            <TownSign
              key={b.slug}
              slug={b.slug}
              index={index}
              name={b.name}
              projectKey={b.key}
              archived={b.archived}
              expanded={expanded}
              inside={!!inside}
              counts={expanded ? countsLine(b.counts) : ""}
              leadName={expanded && !b.archived ? b.lead.displayName : ""}
              leadStatus={lead?.laneStatus ?? null}
              stale={expanded && model.freshness.stale}
              teamTs={expanded ? model.freshness.teamTs : null}
              go={go}
            />
          );
        })}
        {!inside && <Wayfinding districts={props.districts} district={props.district} onDistrict={props.onDistrict} onEnter={props.onEnter} />}
        {inside && !inside.archived && <Interior building={inside} model={model} props={props} compact={compact} />}
        {inside && !compact && card && (
          <div className="anchor card-anchor" data-anchor={`card:${inside.slug}:${card.key}`}>
            {card.element}
          </div>
        )}
        {!inside && (
          <>
            <div className="anchor" data-anchor="c:town-hall">
              <span className="town-sign civic">
                <span className="sign-title">
                  <strong>{civicLabel(civicWords(props.plan.civic).hall)}</strong>
                </span>
                {props.details && <span className="sign-counts civic-names">{model.townHall.length ? model.townHall.map((a) => a.displayName).join(", ") : "nobody here"}</span>}
              </span>
            </div>
            <div className="anchor" data-anchor="c:post-office">
              <span className="town-sign civic">
                <span className="sign-title">
                  <strong>{civicLabel(civicWords(props.plan.civic).post)}</strong>
                </span>
                {props.details && <span className="sign-counts civic-names">{model.postOffice.length ? model.postOffice.map((a) => a.displayName).join(", ") : "the postman is out"}</span>}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** The agent card for the selected agent of the entered building, when it is open: its facts from the projection, its
    sections from the registry. Null when there is nothing to show (no agent selected, the agent is not here). */
function useAgentCard(props: Props, inside: Building | null, compact: boolean, portrait: (canvas: HTMLCanvasElement) => boolean): { key: string; element: ReactNode } | null {
  const key = props.card && props.selection.selected?.kind === "agent" ? props.selection.selected.key : null;
  const { model } = props;
  const demo = model.mode === "demo";
  const facts = useMemo(() => (key && inside ? agentCardFacts(model, worldRuntime().projection.facts, key) : null), [key, inside, model]);
  const sections = useMemo(() => (facts ? renderAgentCard(facts, { now: model.now, freshness: model.freshness, loopsUrl: demo ? null : loopsWebUrl(SOURCE.health) }) : []), [facts, model.now, model.freshness, demo]);
  if (!key || !facts || !inside || !inside.agents.some((a) => a.key === key)) return null;
  return {
    key,
    element: (
      <AgentCard
        facts={facts}
        sections={sections}
        freshness={model.freshness}
        demo={demo}
        following={props.following === key}
        sheet={compact}
        onFollow={() => props.onFollow(props.following === key ? null : key)}
        onClose={props.onCloseCard}
        portrait={portrait}
      />
    ),
  };
}

/* A building's sign. Memoised on plain values: the model is new many times a second, a sign changes rarely, and a
   region has twenty of them. */
const TownSign = memo(function TownSign(props: {
  slug: string;
  index: number;
  name: string;
  projectKey: string;
  archived: boolean;
  expanded: boolean;
  inside: boolean;
  counts: string;
  leadName: string;
  leadStatus: LaneStatus | null;
  stale: boolean;
  teamTs: string | null;
  go: { current: { onEnter: (slug: string) => void; onHover: (index: number | null) => void } };
}) {
  const { slug, index, name, projectKey, archived, expanded, inside, go } = props;
  return (
    <div className={`anchor${expanded ? " raised" : ""}`} data-anchor={`b:${slug}`}>
      <button
        type="button"
        className={`town-sign${expanded ? " expanded" : ""}${archived ? " archived" : ""}`}
        aria-label={inside ? `${name} (${projectKey}), inside` : `Enter ${name} (${projectKey})`}
        tabIndex={inside ? -1 : 0}
        onClick={() => !inside && go.current.onEnter(slug)}
        onFocus={() => go.current.onHover(index)}
      >
        <span className="sign-title">
          {archived && <Archive className="icon icon-sm" aria-hidden="true" />}
          <strong className="sign-name">{name}</strong>
          <span className="sign-key">{projectKey}</span>
          {archived && <span className="sign-archived">archived</span>}
        </span>
        {expanded && <span className="sign-counts">{props.counts}</span>}
        {expanded && !archived && (
          <span className="sign-lead">
            Lead {props.leadName}
            {props.leadStatus ? <LaneChip status={props.leadStatus} freshness={{ stale: props.stale, teamTs: props.teamTs, ageSeconds: null }} /> : <span className="sign-muted">not in the building</span>}
          </span>
        )}
      </button>
    </div>
  );
});

/* What the town says from a distance. A region's districts each carry one card (the name, how much lives there, the
   open work) with one beacon when anything inside needs a person; a building that needs a person carries a small pin
   over its roof. The scene shows the cards from far and the building signs nearer (`data-detail` on the labels host,
   `labelDetail` in wayfinding.ts); every fact here is also a sentence in the text view. */
function Wayfinding({ districts, district, onDistrict, onEnter }: { districts: DistrictPlace[]; district: string | null; onDistrict: (id: string) => void; onEnter: (slug: string) => void }) {
  // The model is new many times a second and these labels rarely change: they are worked out as plain values and
  // drawn again only when one of those differs.
  const cards =
    districts.length > 1
      ? districts.map((d) => {
          const summary = summarise(d.buildings);
          return { id: d.id, name: d.name, color: d.zone?.color ?? null, beacon: summary.beacon, total: needsTotal(summary.needs), needs: needsWords(summary.needs), buildings: summary.buildings, agents: summary.agents, work: activeWords(summary.counts), words: summaryWords(summary) };
        })
      : [];
  const pins = districts.flatMap((d) =>
    d.buildings.flatMap((b) => {
      const needs = needsOf(b);
      const total = needsTotal(needs);
      return total ? [{ slug: b.slug, name: b.name, total, words: needsWords(needs) }] : [];
    }),
  );
  const key = JSON.stringify([cards, pins]);
  const go = useRef({ onDistrict, onEnter });
  go.current = { onDistrict, onEnter };
  return useMemo(
    () => (
      <>
        {cards.map((d) => (
          <div key={d.id} className="anchor district-anchor" data-anchor={`d:${d.id}`}>
            <button
              type="button"
              className={`district-card${d.beacon ? " beacon" : ""}${district === d.id ? " current" : ""}`}
              data-color={d.color ?? undefined}
              aria-label={`${d.name}, district. ${d.words}${district === d.id ? " You are here." : " Go there."}`}
              aria-current={district === d.id ? "location" : undefined}
              onClick={() => go.current.onDistrict(d.id)}
            >
              <span className="district-name">
                <span className="district-dot" aria-hidden="true" />
                <strong>{d.name}</strong>
                {d.beacon && (
                  <span className="district-beacon">
                    <TriangleAlert className="icon icon-sm" aria-hidden="true" />
                    {d.total}
                  </span>
                )}
              </span>
              <span className="district-counts">
                {d.buildings} {d.buildings === 1 ? "building" : "buildings"}, {d.agents} {d.agents === 1 ? "agent" : "agents"}
              </span>
              <span className="district-work">{d.work}</span>
              {d.needs && <span className="district-needs">Needs a person: {d.needs}</span>}
            </button>
          </div>
        ))}
        {pins.map((b) => (
          <div key={b.slug} className="anchor need-anchor" data-anchor={`n:${b.slug}`}>
            <button type="button" className="need-pin" aria-label={`${b.name} needs a person: ${b.words}. Go inside.`} title={`${b.name}: ${b.words}`} onClick={() => go.current.onEnter(b.slug)}>
              <TriangleAlert className="icon icon-sm" aria-hidden="true" />
              <span className="need-count">{b.total}</span>
              <span className="need-words">{b.words}</span>
            </button>
          </div>
        ))}
      </>
    ),
    // The values decide; the arrays are new each render.
    [key, district],
  );
}

/* Labels stay few, like the Greenhouse room: by default a name pill and at most one bubble per robot. A room's other
   labels (its sign, update cards, status and waiting tags, stalled clocks, pallet counts, rule chips) show while the room
   is revealed (under the pointer, with the keyboard focus or zoomed to), for the agent or object under the pointer or
   selected, and everywhere with Details on. Below 600 px only the focused or zoomed room reveals, there is one room sign
   (in one word), and name pills show only in a revealed room. Everything hidden here stays in the text view. */
const COMPACT = "(max-width: 599px)";
function useCompact(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const media = window.matchMedia(COMPACT);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    () => window.matchMedia(COMPACT).matches,
  );
}

const same = (a: Pick | null, b: Pick | null) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

/** Labels inside the entered building. */
function Interior({ building: b, model, props, compact }: { building: Building; model: WorldModel; props: Props; compact: boolean }) {
  const template = buildingTemplate(b);
  const layout = placeObjects(b, template, assignDesks(b, template));
  const nameOf = (slug: string | null) => model.buildings.find((x) => x.slug === slug)?.name ?? slug ?? "another building";
  // A hovered room reveals its labels; a nameplate is for the agent or object under the pointer, else the selected one.
  const hovered = props.selection.hover?.kind === "room" ? null : props.selection.hover;
  // With the card open the selected agent's plate gives way to it; a hovered agent keeps its own.
  const shown = hovered ?? (props.card && props.selection.selected?.kind === "agent" ? null : props.selection.selected);
  const published = b.releases.filter((r) => r.publishedAt);
  const focusedRoom = props.room ?? props.zoomed;
  const picked = (target: Pick) => same(props.selection.hover, target) || same(props.selection.selected, target);
  const revealed = new Set<RoomKind>();
  for (const room of [props.room, props.zoomed]) if (room) revealed.add(room);
  if (!compact) for (const target of [props.selection.hover, props.selection.selected]) if (target?.kind === "room") revealed.add(target.room);
  const shows = (room: RoomKind | null | undefined) => props.details || (!!room && revealed.has(room));
  const roomOfAgent = (key: string) => b.agents.find((a) => a.key === key)?.room ?? null;
  const editing = !!props.town?.build;
  // The three-room plan (addendum): the halls carry their own names, the racks their signs, the counter the archive.
  const threeRoom = isThreeRoom(template);
  const hall = (kind: RoomKind) => (threeRoom ? hallName(kind) : null);
  const racks = threeRoom ? template.rooms.flatMap((r) => r.layout.props.filter((p) => RACKS.some((rack) => rack.definitionId === p.definitionId)).map((p) => ({ room: r.kind, prop: p }))) : [];
  const counter = threeRoom && template.rooms.some((r) => r.layout.props.some((p) => p.definitionId === "archive-counter"));
  return (
    <>
      {template.rooms.map((r) => {
        const room = b.rooms.find((x) => x.kind === r.kind);
        const focused = props.room === r.kind;
        if (compact ? r.kind !== focusedRoom : !shows(r.kind)) return null;
        return (
          <div key={r.kind} className="anchor" data-anchor={`r:${b.slug}:${r.kind}`}>
            <span className={`room-sign${room && !room.present ? " dimmed" : ""}${focused ? " focused" : ""}`}>
              <strong>{hall(r.kind) ?? (compact ? shortRoomName(r.kind) : roomName(b, r.kind))}</strong>
              {room && !room.present && <span className="sign-muted">{room.emptyLabel}</span>}
              {r.kind === "lobby" && !counter && b.archivedCount > 0 && <span className="sign-muted">{b.archivedCount} archived</span>}
            </span>
          </div>
        );
      })}
      {racks
        .filter(({ room }) => shows(room) || compact)
        .map(({ prop }) => {
          const rack = RACKS.find((r) => r.definitionId === prop.definitionId)!;
          const count = b.objects.filter((o) => o.room === rack.room).length;
          return (
            <div key={prop.id} className="anchor" data-anchor={`r:${b.slug}:${prop.definitionId}`}>
              <span className="room-sign rack-sign">
                <strong>{rack.sign}</strong>
                {!compact && <span className="sign-muted">{count === 1 ? "1 ticket" : `${count} tickets`}</span>}
              </span>
            </div>
          );
        })}
      {counter && b.archivedCount > 0 && shows("lobby") && (
        <div className="anchor" data-anchor={`archive:${b.slug}`}>
          <span className="signal-tag">
            <Archive className="icon icon-sm" aria-hidden="true" />
            {b.archivedCount} archived
          </span>
        </div>
      )}
      {b.agents.map((a) => (
        <AgentLabel
          key={a.key}
          slug={b.slug}
          agent={a}
          building={b}
          model={model}
          workingIn={nameOf(a.workingIn)}
          plate={same(shown, { kind: "agent", key: a.key })}
          full={(shows(a.room) && !compact) || picked({ kind: "agent", key: a.key })}
          pill={!compact || shows(a.room) || picked({ kind: "agent", key: a.key })}
        />
      ))}
      {b.objects.map((o) =>
        (o.nameTag && shows(o.room)) || same(shown, { kind: "object", ticketId: o.ticketId }) ? (
          <div key={o.ticketId} className="anchor" data-anchor={`o:${b.slug}:${o.ticketId}`}>
            {same(shown, { kind: "object", ticketId: o.ticketId }) ? (
              <ObjectPlate object={o} building={b} model={model} />
            ) : (
              <span className="name-tag" title={`${o.key} waits on ${o.nameTag}`}>
                <MessageSquare className="icon icon-sm" aria-hidden="true" />
                {o.nameTag}
              </span>
            )}
          </div>
        ) : null,
      )}
      {b.objects
        .filter((o) => o.stall?.state === "stalled" && !o.transit && shows(o.room))
        .map((o) => (
          <div key={`clock-${o.ticketId}`} className="anchor" data-anchor={`c:${b.slug}:${o.ticketId}`}>
            <span className="signal-tag">
              <Clock className="icon icon-sm" aria-hidden="true" />
              {o.key} quiet {o.stall!.quietMinutes ?? "?"} min
              {o.stall!.nudges > 0 && <span className="nudges">nudged {o.stall!.nudges}×</span>}
            </span>
          </div>
        ))}
      {layout.pallets.filter((p) => shows(p.room)).map((p) => (
        <div key={`pallet-${p.room}`} className="anchor" data-anchor={`p:${b.slug}:${p.room}`}>
          <span className="pallet-count" title={`${p.count} more tickets wrapped on a pallet`}>
            {p.count}
          </span>
        </div>
      ))}
      {b.beacons.length > 0 && shows("lead-office") && (
        <div className="anchor" data-anchor={`beacon:${b.slug}`}>
          <span className="signal-tag attention">
            <TriangleAlert className="icon icon-sm" aria-hidden="true" />
            {b.beacons.map((x) => x.text).join("; ")}
          </span>
        </div>
      )}
      {b.mailbox.length > 0 && shows("lobby") && (
        <div className="anchor" data-anchor={`mail:${b.slug}`}>
          <span className="signal-tag">
            {b.mailbox.map((l) => (
              <span key={l.deliveryId} className="letter">
                <Flag className="icon icon-sm" aria-hidden="true" />
                {l.state}: for {l.recipientId}
              </span>
            ))}
          </span>
        </div>
      )}
      {props.town && <TownLabels building={b} town={props.town} errors={editing || props.details} shows={(r) => editing || shows(r.anchor.kind === "room" ? r.anchor.room : r.anchor.kind === "desk" ? roomOfAgent(r.anchor.agent) : null)} />}
      {published.length > 0 && shows("lobby") && (
        <div className="anchor" data-anchor={`banner:${b.slug}`}>
          <span className="signal-tag">
            <Trophy className="icon icon-sm" aria-hidden="true" />
            {published.map((r) => `Release ${r.version ?? r.number} published`).join(", ")}
          </span>
        </div>
      )}
    </>
  );
}

const RULE_WORDS: Record<string, string> = { banner: "milestone banner", crate: "release crate", "sticker.rocket": "rocket", jar: "bug jar", trophy: "release trophy" };

/** Error crates and rule props of the town document, labelled in words: errors in build mode or with Details, a rule chip
    where its room shows. */
function TownLabels({ building: b, town, errors, shows }: { building: Building; town: TownLayer; errors: boolean; shows: (rule: RuleProp) => boolean }) {
  const resolved = resolveBuildingPlacements(town.doc, b.slug, buildingTemplate(b), town.definitions);
  const name = (propId: string) => town.catalogue.get(propId)?.name ?? propId;
  return (
    <>
      {errors &&
        resolved.errors.map((e) => (
        <div key={e.placement.id} className="anchor" data-anchor={`err:${b.slug}:${e.placement.id}`}>
          <span className="signal-tag error-tag">
            <TriangleAlert className="icon icon-sm" aria-hidden="true" />
            {name(e.placement.propId)} cannot stand here: {e.reason}
          </span>
        </div>
      ))}
      {town.invalid
        .filter((r) => errors && r.slug === b.slug)
        .map((r) => (
          <div key={r.ticketKey} className="anchor" data-anchor={`err:${b.slug}:${r.ticketKey}`}>
            <span className="signal-tag error-tag">
              <TriangleAlert className="icon icon-sm" aria-hidden="true" />
              {r.error}
            </span>
          </div>
        ))}
      {town.rules
        .filter((r) => r.anchor.building === b.slug && r.anchor.kind !== "ticket" && shows(r))
        .map((r) => (
          <div key={r.id} className="anchor" data-anchor={`rule:${b.slug}:${r.id}`}>
            <span className="rule-tag" title={r.text}>
              <span className="rule-word">rule</span>
              {RULE_WORDS[r.key] ?? r.key}
              {r.count !== null && `: ${r.count}`}
            </span>
          </div>
        ))}
    </>
  );
}

const CAPTION_ICON: Record<ProgressKind, typeof Play> = { start: Play, update: RefreshCw, done: Check, question: CircleHelp };

function roleWords(role: string, source: RoleSource): string {
  if (source === "fact") return `${role}, a fact`;
  if (source === "override") return `${role}, set by you`;
  return `${role}, from its name`;
}

function statusTag(agent: AgentPlacement, model: WorldModel, workingIn: string) {
  if (agent.presence === "proxy") return `working in ${workingIn}${agent.locationInferred ? " (inferred)" : ""}`;
  if (model.freshness.stale) {
    const since = clockTime(model.freshness.teamTs);
    return since ? `stale since ${since}` : "status unknown";
  }
  if (agent.posture === "greyed") return "status unknown";
  if (agent.posture === "raised-hand") return "blocked";
  return null;
}

/** The dot in a name pill: the lane status by colour, always with its words in the pill's title and the text view. */
function dotTone(agent: AgentPlacement, model: WorldModel): string {
  if (agent.presence === "proxy") return "proxy";
  if (model.freshness.stale || agent.laneStatus === "unknown" || agent.posture === "greyed") return "unknown";
  if (agent.posture === "raised-hand" || agent.laneStatus === "blocked") return "blocked";
  return agent.laneStatus;
}

/** The one bubble a robot may carry by default: a question, a raised hand, a lit alert, or a fresh "done", in that order. */
function bubbleFor(agent: AgentPlacement, model: WorldModel): { icon: typeof Play; text: string; tone: string; title: string } | null {
  if (agent.presence !== "real") return null;
  const caption = agent.caption;
  if (caption?.kind === "question") return { icon: CircleHelp, text: "a little help?", tone: "ask", title: `${agent.displayName} asks on ${caption.ticketKey}: ${caption.text}` };
  if (model.freshness.stale) return null;
  if (agent.posture === "raised-hand") return { icon: Hand, text: "blocked", tone: "ask", title: `${agent.displayName} is blocked` };
  const alert = agent.alerts[0];
  if (alert) return { icon: TriangleAlert, text: alert, tone: "alert", title: agent.alerts.join("; ") };
  if (caption?.kind === "done" && (caption.until == null || caption.until - model.now >= 4000))
    return { icon: Check, text: "done", tone: "done", title: `${agent.displayName} on ${caption.ticketKey}: ${caption.text}` };
  return null;
}

function AgentLabel({
  slug,
  agent,
  building,
  model,
  workingIn,
  plate,
  full,
  pill: showPill,
}: {
  slug: string;
  agent: AgentPlacement;
  building: Building;
  model: WorldModel;
  workingIn: string;
  plate: boolean;
  /** The agent's room is revealed, the agent is picked, or Details is on: its update card and every tag show. */
  full: boolean;
  /** False on a phone outside a revealed room; the text view keeps every name. */
  pill: boolean;
}) {
  const tag = statusTag(agent, model, workingIn);
  const caption = agent.presence === "real" && full ? agent.caption : null;
  const Icon = caption ? CAPTION_ICON[caption.kind] : null;
  const fading = caption?.until != null && caption.until - model.now < 4000;
  const alerts = full ? agent.alerts : [];
  const bubble = full ? null : bubbleFor(agent, model);
  const words = agent.presence === "proxy" ? (tag ?? "working elsewhere") : laneWords(agent.laneStatus, model.freshness);
  const pill = showPill && !plate && (
    <span className={`name-pill${agent.presence === "proxy" ? " proxy" : ""}`} title={`${agent.displayName}: ${words}`}>
      <span className="pill-dot" data-tone={dotTone(agent, model)} aria-hidden="true" />
      {agent.displayName}
    </span>
  );
  if (!pill && !bubble && !plate && !(full && (tag || caption || alerts.length))) return null;
  return (
    <div className={`anchor agent-anchor${plate ? " picked" : ""}`} data-anchor={`a:${slug}:${agent.key}`}>
      <span className="agent-stack">
        {bubble && (
          <span className={`bubble ${bubble.tone}`} title={bubble.title}>
            <bubble.icon className="icon icon-sm" aria-hidden="true" />
            <span className="bubble-text">{bubble.text}</span>
          </span>
        )}
        {caption && Icon && (
          <span className={`caption${fading ? " fading" : ""}${caption.kind === "question" ? " question" : ""}`} title={`${agent.displayName} on ${caption.ticketKey}`}>
            <span className="caption-kind">
              <Icon className="icon icon-sm" aria-hidden="true" />
              {caption.kind}
            </span>
            <span className="caption-text">{caption.text}</span>
          </span>
        )}
        {plate ? (
          <span className={`agent-plate${agent.presence === "proxy" ? " proxy" : ""}`}>
            <span className="plate-name">
              <strong>{agent.displayName}</strong>
              <span className="sign-muted">{roleWords(agent.key === building.lead.id && agent.roleSource === "fact" ? "lead" : agent.role, agent.roleSource)}</span>
            </span>
            {agent.presence === "proxy" ? (
              <span className="sign-muted">{tag}</span>
            ) : (
              <span className="plate-row">
                <LaneChip status={agent.laneStatus} freshness={model.freshness} />
                {agent.posture === "relaxed" && agent.laneStatus === "done" && <span className="sign-muted">herdr says done; not a finished ticket</span>}
              </span>
            )}
            {agent.deskTicketKey && <span className="sign-muted">Desk: {agent.deskTicketKey}</span>}
            {agent.alerts.map((alert) => (
              <span key={alert} className="sign-muted">
                Lit: {alert}
              </span>
            ))}
            <DemoNote model={model} />
          </span>
        ) : (
          full && (
            <>
              {tag && (
                <span className={`status-tag${tag === "blocked" ? " blocked" : ""}${agent.presence === "proxy" ? " proxy" : ""}${model.freshness.stale ? " stale" : ""}`}>
                  {tag === "blocked" && <Hand className="icon icon-sm" aria-hidden="true" />}
                  {tag}
                </span>
              )}
              {alerts.length > 0 && <span className="status-tag alert">{alerts.join("; ")}</span>}
            </>
          )
        )}
        {pill}
      </span>
    </div>
  );
}

const STATUS_WORDS = { backlog: "backlog", planned: "planned", in_progress: "in progress", review: "review", done: "done" } as const;

function ObjectPlate({ object: o, building, model }: { object: WorkObject; building: Building; model: WorldModel }) {
  const holder = o.deskOf ? (building.agents.find((a) => a.key === o.deskOf)?.displayName ?? o.deskOf) : null;
  return (
    <span className="agent-plate object-plate">
      <span className="plate-name">
        <strong>{o.key}</strong>
        <span className="sign-muted">
          {o.kind}, {o.rejected ? "turned down" : STATUS_WORDS[o.status]}
        </span>
      </span>
      <span className="plate-title">{o.title}</span>
      <span className="plate-row">
        {o.priorityTag && <Chip.Attention>{o.priorityTag} priority</Chip.Attention>}
        {o.blocked && <Chip>blocked</Chip>}
        {o.sealed && <Chip>held</Chip>}
        {o.rejected && <Chip>won't do</Chip>}
        {o.stall && <Chip.Stalled>{o.stall.state === "stalled" ? `stalled, quiet ${o.stall.quietMinutes ?? "?"} min` : "needs attention"}</Chip.Stalled>}
        {(o.nameTag || o.waitingOnHuman) && (
          <Chip icon={<MessageSquare className="icon icon-sm" aria-hidden="true" />}>waiting on {o.nameTag ?? "a person"}</Chip>
        )}
      </span>
      {o.status === "in_progress" && <span className="sign-muted">{holder ? `On the desk of ${holder}${o.deskInferred ? " (inferred from its status line)" : ""}` : "In the lead's inbox tray"}</span>}
      {o.rejected?.reason && <span className="sign-muted">Turned down: {o.rejected.reason}</span>}
      {o.milestone && <span className="sign-muted">Milestone {o.milestone.key}</span>}
      {o.transit && <span className="sign-muted">In transit: the ticket drone carries it</span>}
      <DemoNote model={model} />
    </span>
  );
}

function DemoNote({ model }: { model: WorldModel }) {
  if (model.mode !== "demo") return null;
  return <span className="demo-note">Demo: there is no crewhub-loops web app to open</span>;
}

/** `?stress=1` (dev only): frame time over the last 300 drawn frames and the walk engine's tick. */
function FrameOverlay({ scene }: { scene: { current: TownScene | null } }) {
  const [stats, setStats] = useState<FrameStats | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = scene.current?.frameStats() ?? null;
      setStats(next);
      (window as unknown as { __frameStats?: FrameStats | null }).__frameStats = next;
    }, 500);
    return () => window.clearInterval(id);
  }, [scene]);
  if (!stats) return null;
  const ms = (v: number) => v.toFixed(1);
  return (
    <output className="dev-overlay" aria-live="off">
      <strong>Stress: {stats.walkers} walkers</strong>
      <span>
        frame {ms(stats.mean)} / p95 {ms(stats.p95)} / max {ms(stats.max)} ms ({stats.frames})
      </span>
      <span>
        work {ms(stats.workMean)} / p95 {ms(stats.workP95)} ms, engine {stats.tickMean.toFixed(2)} / max {stats.tickMax.toFixed(2)} ms
      </span>
      <span>{stats.calls} draw calls</span>
    </output>
  );
}
