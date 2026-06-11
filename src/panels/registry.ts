// Panel-shell glue: the stable import path for panel lanes (B/C). The real
// registry lives with the shell in src/app/panel-registry.tsx; lanes wire
// their finished panels by swapping the lazy import of their registry entry.
export { PANELS, PANEL_LIST, type PanelDefinition, type PanelProps } from "@/app/panel-registry";
export type { PanelKind } from "@/app/layout-tree";
