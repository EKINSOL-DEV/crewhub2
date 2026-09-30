import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Archive, Sprout } from "lucide-react";
import type { AgentPlacement, WorldModel } from "@crewhub/world-model";
import { TownScene, type CameraAction } from "../world/TownScene";
import { LaneChip } from "../world/lane";
import { countsLine, TOWN_CAPACITY } from "../world/townLayout";

interface Props {
  model: WorldModel;
  entered: string | null;
  focused: number;
  ringVisible: boolean;
  reducedMotion: boolean;
  action: { id: number; type: CameraAction };
  onEnter: (slug: string) => void;
  onHover: (index: number | null) => void;
  onError: () => void;
}

/** The Three.js town and its HTML labels. Labels carry words for every fact they show; the scene only positions them. */
export default function WorldCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLDivElement>(null);
  const scene = useRef<TownScene | null>(null),
    latest = useRef(props);
  const [ready, setReady] = useState(false);
  latest.current = props;
  const view = { model: props.model, entered: props.entered, focused: props.focused, ringVisible: props.ringVisible, reducedMotion: props.reducedMotion };
  useEffect(() => {
    if (!host.current || !labels.current) return;
    try {
      scene.current = new TownScene(host.current, labels.current, view, {
        enter: (slug) => latest.current.onEnter(slug),
        hover: (index) => latest.current.onHover(index),
        error: () => latest.current.onError(),
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
  const nameOf = (slug: string | null) => model.buildings.find((b) => b.slug === slug)?.name ?? slug ?? "another building";
  return (
    <>
      <div ref={host} className="canvas-host" />
      {!ready && (
        <div className="room-loading">
          <Sprout size={28} aria-hidden="true" />
          <span>Laying out the town…</span>
        </div>
      )}
      <div ref={labels} className="world-labels">
        {model.buildings.slice(0, TOWN_CAPACITY).map((b, index) => {
          if (inside && inside.slug !== b.slug) return null;
          const expanded = !!inside || (props.ringVisible && props.focused === index);
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
        {inside &&
          !inside.archived &&
          inside.agents.map((a) => <AgentLabel key={a.key} slug={inside.slug} agent={a} isLead={a.key === inside.lead.id} model={model} workingIn={nameOf(a.workingIn)} />)}
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

function AgentLabel({ slug, agent, isLead, model, workingIn }: { slug: string; agent: AgentPlacement; isLead: boolean; model: WorldModel; workingIn: string }) {
  const role = isLead ? "lead" : agent.roleSource === "name-rule" ? `${agent.role}, from its name` : agent.role;
  return (
    <div className="anchor" data-anchor={`a:${slug}:${agent.key}`}>
      <span className={`agent-plate${agent.presence === "proxy" ? " proxy" : ""}`}>
        <span className="plate-name">
          <strong>{agent.displayName}</strong>
          <span className="sign-muted plate-role">{role}</span>
        </span>
        {agent.presence === "proxy" ? (
          <span className="sign-muted">
            working in {workingIn}
            {agent.locationInferred ? " (inferred)" : ""}
          </span>
        ) : (
          <LaneChip status={agent.laneStatus} freshness={model.freshness} />
        )}
      </span>
    </div>
  );
}
