/** What every scenario's installation shares: the labels loops and the prop flow rely on. */
import type { LabelOut } from "@crewhub/loops-client";

/** `awaiting-deploy` and `release` are loops' own global labels; `prop` marks a prop request. */
export const GLOBAL_LABELS: LabelOut[] = [
  { id: "lb_awaiting_deploy", projectId: null, name: "awaiting-deploy", color: "tangerine", revision: 1 },
  { id: "lb_release", projectId: null, name: "release", color: "coral", revision: 1 },
  { id: "lb_prop", projectId: null, name: "prop", color: "circle", revision: 1 },
];
