import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Archive, Check, CircleHelp, Clock, Flag, Hand, MessageSquare, Play, RefreshCw, Sprout, TriangleAlert, Trophy } from "lucide-react";
import type { AgentPlacement, Building, ProgressKind, RoleSource, WorkObject, WorldModel } from "@crewhub/world-model";
import { STRESS, worldRuntime } from "../state/world";
import { useDark } from "../state/theme";
import { useQuality } from "../state/quality";
import type { Pick } from "../world/buildingView";
import { buildingTemplate } from "../world/buildingTemplate";
import { assignDesks, placeObjects, roomName, shortRoomName } from "../world/interiorLayout";
import { TownScene, type BuildPointer, type CameraAction, type FrameStats } from "../world/TownScene";
import { resolveBuildingPlacements } from "../world/placements";
import type { TownLayer } from "../world/propLayer";
import type { Ambient } from "../world/movement";
import { LaneChip } from "../world/lane";
import { clockTime, countsLine, laneWords, TOWN_CAPACITY } from "../world/townLayout";
import type { RoomKind, RuleProp } from "@crewhub/world-model";
import { Chip } from "./primitives";

export interface Selection {
  hover: Pick | null;
  selected: Pick | null;
}

interface Props {
  model: WorldModel;
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
  onEnter: (slug: string) => void;
  onHover: (index: number | null) => void;
  onPick: (target: Pick | null, hover: boolean) => void;
  onError: () => void;
  town: TownLayer | null;
  onBuild: (kind: BuildPointer, at: { room: RoomKind; cell: { x: number; z: number } } | null, pick: Pick | null) => void;
}

const now = () => worldRuntime().source.now();
const speed = () => worldRuntime().source.playback.speed();

/** The Three.js town and its HTML labels. Labels carry words for every fact they show; the scene only positions them. */
export default function WorldCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLDivElement>(null);
  const scene = useRef<TownScene | null>(null),
    latest = useRef(props);
  const [ready, setReady] = useState(false);
  const dark = useDark();
  const quality = useQuality();
  latest.current = props;
  // The ghost's verdict tile takes the scene's theme.
  const town = useMemo(
    () => (props.town?.build ? { ...props.town, build: { ...props.town.build, theme: dark ? ("lamplight" as const) : ("day" as const) } } : props.town),
    [props.town, dark],
  );
  const view = {
    model: props.model,
    entered: props.entered,
    focused: props.focused,
    ringVisible: props.ringVisible,
    room: props.room,
    zoomed: props.zoomed,
    reducedMotion: props.reducedMotion,
    theme: dark ? ("lamplight" as const) : ("day" as const),
    quality,
    now,
    town,
    speed,
    ambient: props.ambient,
    measure: STRESS,
    selectedAgent: props.selection.selected?.kind === "agent" ? props.selection.selected.key : null,
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
      });
      setReady(true);
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

  const { model, entered } = props;
  const inside = model.buildings.find((b) => b.slug === entered) ?? null;
  const compact = useCompact();
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
      <div ref={labels} className="world-labels">
        {model.buildings.slice(0, TOWN_CAPACITY).map((b, index) => {
          if (inside && inside.slug !== b.slug) return null;
          // Inside, the breadcrumb names the building: its sign comes back with Details (small on a phone). In the town a
          // sign is a quiet name until the focus ring or Details expands it with its counts and its lead.
          if (inside && !props.details) return null;
          const expanded = inside ? !compact : (props.ringVisible && props.focused === index) || props.details;
          const lead = b.agents.find((a) => a.key === b.lead.id && a.presence === "real");
          return (
            <div key={b.slug} className={`anchor${expanded ? " raised" : ""}`} data-anchor={`b:${b.slug}`}>
              <button
                type="button"
                className={`town-sign${expanded ? " expanded" : ""}${b.archived ? " archived" : ""}`}
                aria-label={inside ? `${b.name} (${b.key}), inside` : `Enter ${b.name} (${b.key})`}
                tabIndex={inside ? -1 : 0}
                onClick={() => !inside && props.onEnter(b.slug)}
                onFocus={() => props.onHover(index)}
              >
                <span className="sign-title">
                  {b.archived && <Archive className="icon icon-sm" aria-hidden="true" />}
                  <strong className="sign-name">{b.name}</strong>
                  <span className="sign-key">{b.key}</span>
                  {b.archived && <span className="sign-archived">archived</span>}
                </span>
                {expanded && <span className="sign-counts">{countsLine(b.counts)}</span>}
                {expanded && !b.archived && (
                  <span className="sign-lead">
                    Lead {b.lead.displayName}
                    {lead ? <LaneChip status={lead.laneStatus} freshness={model.freshness} /> : <span className="sign-muted">not in the building</span>}
                  </span>
                )}
              </button>
            </div>
          );
        })}
        {inside && !inside.archived && <Interior building={inside} model={model} props={props} compact={compact} />}
        {!inside && (
          <>
            <div className="anchor" data-anchor="c:town-hall">
              <span className="town-sign civic">
                <span className="sign-title">
                  <strong>Town hall</strong>
                </span>
                {props.details && <span className="sign-counts civic-names">{model.townHall.length ? model.townHall.map((a) => a.displayName).join(", ") : "nobody here"}</span>}
              </span>
            </div>
            <div className="anchor" data-anchor="c:post-office">
              <span className="town-sign civic">
                <span className="sign-title">
                  <strong>Post office</strong>
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
  const shown = hovered ?? props.selection.selected;
  const published = b.releases.filter((r) => r.publishedAt);
  const focusedRoom = props.room ?? props.zoomed;
  const picked = (target: Pick) => same(props.selection.hover, target) || same(props.selection.selected, target);
  const revealed = new Set<RoomKind>();
  for (const room of [props.room, props.zoomed]) if (room) revealed.add(room);
  if (!compact) for (const target of [props.selection.hover, props.selection.selected]) if (target?.kind === "room") revealed.add(target.room);
  const shows = (room: RoomKind | null | undefined) => props.details || (!!room && revealed.has(room));
  const roomOfAgent = (key: string) => b.agents.find((a) => a.key === key)?.room ?? null;
  const editing = !!props.town?.build;
  return (
    <>
      {template.rooms.map((r) => {
        const room = b.rooms.find((x) => x.kind === r.kind);
        const focused = props.room === r.kind;
        if (compact ? r.kind !== focusedRoom : !shows(r.kind)) return null;
        return (
          <div key={r.kind} className="anchor" data-anchor={`r:${b.slug}:${r.kind}`}>
            <span className={`room-sign${room && !room.present ? " dimmed" : ""}${focused ? " focused" : ""}`}>
              <strong>{compact ? shortRoomName(r.kind) : roomName(b, r.kind)}</strong>
              {room && !room.present && <span className="sign-muted">{room.emptyLabel}</span>}
              {r.kind === "lobby" && b.archivedCount > 0 && <span className="sign-muted">{b.archivedCount} archived</span>}
            </span>
          </div>
        );
      })}
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
    <div className="anchor agent-anchor" data-anchor={`a:${slug}:${agent.key}`}>
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
          {o.kind}, {STATUS_WORDS[o.status]}
        </span>
      </span>
      <span className="plate-title">{o.title}</span>
      <span className="plate-row">
        {o.priorityTag && <Chip.Attention>{o.priorityTag} priority</Chip.Attention>}
        {o.blocked && <Chip>blocked</Chip>}
        {o.sealed && <Chip>held</Chip>}
        {o.stall && <Chip.Stalled>{o.stall.state === "stalled" ? `stalled, quiet ${o.stall.quietMinutes ?? "?"} min` : "needs attention"}</Chip.Stalled>}
        {(o.nameTag || o.waitingOnHuman) && (
          <Chip icon={<MessageSquare className="icon icon-sm" aria-hidden="true" />}>waiting on {o.nameTag ?? "a person"}</Chip>
        )}
      </span>
      {o.status === "in_progress" && <span className="sign-muted">{holder ? `On the desk of ${holder}${o.deskInferred ? " (inferred from its status line)" : ""}` : "In the lead's inbox tray"}</span>}
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
