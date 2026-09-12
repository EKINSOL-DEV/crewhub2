import { useEffect, useRef, useState } from "react";
import { Check, CircleHelp, Sprout } from "lucide-react";
import type { WorldSimulation } from "@crewhub/world-engine";
import { RoomScene, type CameraAction, type SceneView } from "../world/Scene";
import { crew, statusLabel } from "../world/data";

interface Props {
  simulation: WorldSimulation;
  view: SceneView;
  action: { id: number; type: CameraAction };
  onSelect: (id: string) => void;
  onProp: (id: string) => void;
  onNotice: (message: string) => void;
  onPlaced: () => void;
  onChanged: () => void;
  onError: () => void;
}
export default function WorldCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    labels = useRef<HTMLDivElement>(null);
  const scene = useRef<RoomScene | null>(null),
    latest = useRef(props);
  const [ready, setReady] = useState(false);
  latest.current = props;
  useEffect(() => {
    if (!host.current || !labels.current) return;
    try {
      scene.current = new RoomScene(
        host.current,
        labels.current,
        props.simulation,
        latest.current.view,
        {
          select: (id) => latest.current.onSelect(id),
          prop: (id) => latest.current.onProp(id),
          notice: (message) => latest.current.onNotice(message),
          placed: () => latest.current.onPlaced(),
          changed: () => latest.current.onChanged(),
          error: () => latest.current.onError(),
        },
      );
      setReady(true);
    } catch {
      latest.current.onError();
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [props.simulation]);
  useEffect(() => {
    scene.current?.setView(props.view);
  }, [props.view]);
  useEffect(() => {
    if (props.action.id) scene.current?.cameraAction(props.action.type);
  }, [props.action]);
  return (
    <>
      <div ref={host} className="canvas-host" />
      {!ready && (
        <div className="room-loading">
          <Sprout size={28} />
          <span>Growing your little world…</span>
        </div>
      )}
      <div ref={labels} className="world-labels">
        {crew.map((agent, index) => {
          const status = props.view.snapshot.sessions[index]!.status;
          return (
            <button
              key={agent.id}
              data-agent-label={agent.id}
              className={`world-label ${props.view.selectedId === agent.id ? "selected" : ""}`}
              aria-label={`Select ${agent.name}: ${statusLabel[status]}`}
              aria-pressed={props.view.selectedId === agent.id}
              onClick={() => props.onSelect(agent.id)}
            >
              {status === "needs-input" && (
                <span className="label-callout attention">
                  <CircleHelp size={12} /> A little help?
                </span>
              )}
              {status === "completed" && (
                <span className="label-callout complete">
                  <Check size={12} /> Ready for you
                </span>
              )}
              <span className="label-name">
                <i style={{ background: agent.color }} />
                {agent.name}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
