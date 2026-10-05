/* The casts the casting room shows. TEMPORARY ADAPTER: until the cast registry lands (task cast-core, milestone 1) the
   only cast is the style's own robot, wrapped as a `FigureHandle`. The casting room talks to `PreviewCast` only, so
   switching to the registry replaces this file's body and nothing else. */
import type { CastRole, FigureAnchors, FigureHandle, FigureOptions, FigureState } from "@crewhub/world-cast";
import type { ResolvedStyle, RobotPosture, RobotRole } from "@crewhub/world-style";

export interface PreviewCast {
  id: string;
  name: string;
  description: string;
  figure(options: FigureOptions): FigureHandle;
}

const ROBOT_ROLES: Record<CastRole, RobotRole> = { lead: "lead", worker: "worker", design: "design", analyst: "analyst", postman: "router", operator: "router", unknown: "worker" };
const ROBOT_ANCHORS: FigureAnchors = { label: [0, 1.62, 0], carry: [0, 0.62, 0.34], ground: 0.3, height: 1.55 };

function posture(state: FigureState): RobotPosture {
  if (state.activity === "walking") return "walking";
  if (state.activity === "stale") return "greyed";
  if (state.activity === "blocked" || state.waiting) return "raised-hand";
  return state.activity === "working" ? "focused" : "relaxed";
}

function robotFigure(style: ResolvedStyle, options: FigureOptions): FigureHandle {
  const robot = style.robot({ key: options.key, accent: options.accent, role: ROBOT_ROLES[options.role] });
  return {
    object: robot.object,
    anchors: ROBOT_ANCHORS,
    setState(state) {
      robot.setPosture(posture(state));
      robot.setProxy(state.proxy);
      robot.setAlert(state.alert);
    },
    setDetail: (detail) => robot.setDetail(detail),
    setHighlight() {},
    update: (seconds) => robot.update(seconds),
    dispose: () => robot.dispose(),
  };
}

export function previewCasts(style: ResolvedStyle): PreviewCast[] {
  return [
    {
      id: "classic-bots",
      name: "Classic bots",
      description: "The soft Greenhouse robots: a visor, an antenna and a badge.",
      figure: (options) => robotFigure(style, options),
    },
  ];
}
