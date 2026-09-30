/**
 * The text view of build mode: every placed prop, every user prop with where it came from, the rule props and the
 * prop requests that failed, as sentences. Placements and user props are local choices (`cosmetic`); rule props and
 * failed requests come from loops facts (`fact`).
 */
import { roomLabel } from "./rooms.ts";
import type { Catalogue } from "./catalogue.ts";
import type { TextLine } from "./model.ts";
import type { RuleProp } from "./ruleProps.ts";
import type { PlacedProp, TownDocument } from "./townDocument.ts";

/** A done prop ticket whose prop could not be imported; the scene shows a labelled error object for it. */
export interface InvalidPropRequest {
  ticketKey: string;
  /** The building the error object stands in. */
  slug: string;
  error: string;
}

const ROTATION_WORDS = ["not turned", "turned a quarter", "turned half", "turned three quarters"] as const;

function where(p: PlacedProp): string {
  return "town" in p.at ? "in the town square" : `in ${p.at.building}, ${roomLabel(p.at.room)}`;
}

function attached(p: PlacedProp): string {
  if (!p.attachment) return "";
  const { kind, ref } = p.attachment;
  const words = { room: "room", agent: "agent", ticket: "ticket", project: "project" } as const;
  return `, attached to ${words[kind]} ${ref}`;
}

export function describeTownDocument(
  doc: TownDocument,
  catalogue: Catalogue,
  extra: { ruleProps?: readonly RuleProp[]; invalidRequests?: readonly InvalidPropRequest[] } = {},
): TextLine[] {
  const lines: TextLine[] = [];
  const line = (section: string, text: string, kind: TextLine["kind"]) => lines.push({ section, text, kind });

  line("Build", `Town layout revision ${doc.revision}, style ${doc.styleId}, ${doc.placements.length} placed prop${doc.placements.length === 1 ? "" : "s"}.`, "cosmetic");
  for (const plot of doc.plots)
    line("Build", `Plot of ${plot.slug} at ${plot.cell.x},${plot.cell.z}${plot.styleId ? `, style ${plot.styleId}` : ""}.`, "cosmetic");
  for (const p of doc.placements) {
    const entry = catalogue.get(p.propId);
    const name = entry ? `${entry.name} (${p.propId})` : p.propId;
    line("Build: placed props", `${name} ${where(p)} at cell ${p.cell.x},${p.cell.z}, ${ROTATION_WORDS[p.rotation]}${attached(p)}.`, "cosmetic");
  }
  for (const prop of doc.userProps) {
    const from = prop.provenance?.kind === "ticket" ? `from ticket ${prop.provenance.ticketKey}` : "made locally";
    const count = doc.placements.filter((p) => p.propId === prop.id).length;
    line(
      "Build: my props",
      `${prop.name} (${prop.id}), ${prop.category}, ${prop.footprint.width} by ${prop.footprint.depth} cells, ${from}, placed ${count} time${count === 1 ? "" : "s"}.`,
      "cosmetic",
    );
  }
  const off = Object.entries(doc.rules).filter(([, on]) => !on).map(([rule]) => rule);
  if (off.length) line("Build: rule props", `Switched off: ${off.join(", ")}.`, "cosmetic");
  for (const p of extra.ruleProps ?? []) line("Build: rule props", p.text, "fact");
  for (const r of extra.invalidRequests ?? [])
    line("Build: prop requests", `Error object in ${r.slug}: ${r.error}.`, "fact");
  return lines;
}
