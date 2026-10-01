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
import { clockTime, countsLine, TOWN_CAPACITY } from "../world/townLayout";
import type { RoomKind } from "@crewhub/world-model";
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
          // Inside a building on a phone the sign stays small: the breadcrumb names the building, the text view counts.
          const expanded = inside ? !compact : props.ringVisible && props.focused === index;
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
                <span className="sign-counts civic-names">{model.townHall.length ? model.townHall.map((a) => a.displayName).join(", ") : "nobody here"}</span>
              </span>
            </div>
            <div className="anchor" data-anchor="c:post-office">
              <span className="town-sign civic">
                <span className="sign-title">
                  <strong>Post office</strong>
                </span>
                <span className="sign-counts civic-names">{model.postOffice.length ? model.postOffice.map((a) => a.displayName).join(", ") : "the postman is out"}</span>
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* Below 600 px a building's labels crowd: one room sign (the focused room's, in one word) and captions only for the
   agent under the pointer or selected, name tags and alert tags only for the focused room or the selected object or
   agent. Everything hidden here stays in the text view. */
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
  const shown = props.selection.hover ?? props.selection.selected;
  const published = b.releases.filter((r) => r.publishedAt);
  // On a phone, name tags and alert tags show only for the focused room or the selected object or agent.
  const focusedRoom = props.room ?? props.zoomed;
  const picked = (target: Pick) => same(props.selection.hover, target) || same(props.selection.selected, target);
  return (
    <>
      {template.rooms.map((r) => {
        const room = b.rooms.find((x) => x.kind === r.kind);
        const focused = props.room === r.kind;
        if (compact && r.kind !== (props.room ?? props.zoomed)) return null;
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
          caption={!compact || picked({ kind: "agent", key: a.key })}
          alerts={!compact || a.room === focusedRoom || picked({ kind: "agent", key: a.key })}
        />
      ))}
      {b.objects.map((o) =>
        (o.nameTag && (!compact || o.room === focusedRoom)) || same(shown, { kind: "object", ticketId: o.ticketId }) ? (
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
        .filter((o) => o.stall?.state === "stalled" && !o.transit)
        .map((o) => (
          <div key={`clock-${o.ticketId}`} className="anchor" data-anchor={`c:${b.slug}:${o.ticketId}`}>
            <span className="signal-tag">
              <Clock className="icon icon-sm" aria-hidden="true" />
              {o.key} quiet {o.stall!.quietMinutes ?? "?"} min
              {o.stall!.nudges > 0 && <span className="nudges">nudged {o.stall!.nudges}×</span>}
            </span>
          </div>
        ))}
      {layout.pallets.map((p) => (
        <div key={`pallet-${p.room}`} className="anchor" data-anchor={`p:${b.slug}:${p.room}`}>
          <span className="pallet-count" title={`${p.count} more tickets wrapped on a pallet`}>
            {p.count}
          </span>
        </div>
      ))}
      {b.beacons.length > 0 && (
        <div className="anchor" data-anchor={`beacon:${b.slug}`}>
          <span className="signal-tag attention">
            <TriangleAlert className="icon icon-sm" aria-hidden="true" />
            {b.beacons.map((x) => x.text).join("; ")}
          </span>
        </div>
      )}
      {b.mailbox.length > 0 && (
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
      {props.town && <TownLabels building={b} town={props.town} />}
      {published.length > 0 && (
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

/** Error crates and rule props of the town document, labelled in words. */
function TownLabels({ building: b, town }: { building: Building; town: TownLayer }) {
  const resolved = resolveBuildingPlacements(town.doc, b.slug, buildingTemplate(b), town.definitions);
  const name = (propId: string) => town.catalogue.get(propId)?.name ?? propId;
  return (
    <>
      {resolved.errors.map((e) => (
        <div key={e.placement.id} className="anchor" data-anchor={`err:${b.slug}:${e.placement.id}`}>
          <span className="signal-tag error-tag">
            <TriangleAlert className="icon icon-sm" aria-hidden="true" />
            {name(e.placement.propId)} cannot stand here: {e.reason}
          </span>
        </div>
      ))}
      {town.invalid
        .filter((r) => r.slug === b.slug)
        .map((r) => (
          <div key={r.ticketKey} className="anchor" data-anchor={`err:${b.slug}:${r.ticketKey}`}>
            <span className="signal-tag error-tag">
              <TriangleAlert className="icon icon-sm" aria-hidden="true" />
              {r.error}
            </span>
          </div>
        ))}
      {town.rules
        .filter((r) => r.anchor.building === b.slug && r.anchor.kind !== "ticket")
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

function AgentLabel({
  slug,
  agent,
  building,
  model,
  workingIn,
  plate,
  caption: showCaption,
  alerts: showAlerts,
}: {
  slug: string;
  agent: AgentPlacement;
  building: Building;
  model: WorldModel;
  workingIn: string;
  plate: boolean;
  /** False on a phone unless the agent is under the pointer or selected; the text view keeps every caption. */
  caption: boolean;
  /** False on a phone outside the focused room; the text view keeps every alert. */
  alerts: boolean;
}) {
  const tag = statusTag(agent, model, workingIn);
  const caption = agent.presence === "real" && showCaption ? agent.caption : null;
  const Icon = caption ? CAPTION_ICON[caption.kind] : null;
  const fading = caption?.until != null && caption.until - model.now < 4000;
  const alerts = showAlerts ? agent.alerts : [];
  if (!tag && !caption && !plate && alerts.length === 0) return null;
  return (
    <div className="anchor" data-anchor={`a:${slug}:${agent.key}`}>
      <span className="agent-stack">
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
          <>
            {tag && (
              <span className={`status-tag${tag === "blocked" ? " blocked" : ""}${agent.presence === "proxy" ? " proxy" : ""}${model.freshness.stale ? " stale" : ""}`}>
                {tag === "blocked" && <Hand className="icon icon-sm" aria-hidden="true" />}
                {tag}
              </span>
            )}
            {alerts.length > 0 && <span className="status-tag alert">{alerts.join("; ")}</span>}
          </>
        )}
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
