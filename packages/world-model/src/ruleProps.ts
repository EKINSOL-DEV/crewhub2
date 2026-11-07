/**
 * Rule props (plan 6.3): props made automatically from facts and shown as such. Pure: from the `WorldModel` and the
 * town document's rule switches to a list the renderer draws by semantic key (the style resolves the key to a
 * model) and the text view reads. Archived buildings show none. Ids are stable while the fact holds, so a renderer
 * can materialise a prop when its id appears and remove it when it goes.
 *
 * | Rule | Fact | Key | Anchor |
 * | --- | --- | --- | --- |
 * | `milestone-banner` | each active milestone | `banner` | the lobby |
 * | `release-crate` | each draft release | `crate` | dispatch |
 * | `deploy-sticker` | each ticket labelled `awaiting-deploy` | `sticker.rocket` | the ticket's work object |
 * | `bug-jar` | open bug tickets (not Done), counted | `jar` | the lead's desk |
 * | `release-trophy` | each published release | `trophy` | the lead's desk |
 */
import type { Building, RoomKind, WorldModel } from "./model.ts";
import type { RuleId, TownDocument } from "./townDocument.ts";

export type RulePropKey = "banner" | "crate" | "sticker.rocket" | "jar" | "trophy";

export type RuleAnchor =
  | { kind: "room"; building: string; room: RoomKind }
  | { kind: "desk"; building: string; agent: string }
  | { kind: "ticket"; building: string; ticketKey: string };

export interface RuleProp {
  /** Stable while its fact holds, e.g. `rule:banner:crewhub:ms_1`. */
  id: string;
  rule: RuleId;
  key: RulePropKey;
  anchor: RuleAnchor;
  /** The count on the jar; null for the others. */
  count: number | null;
  /** One sentence for the text view and the tooltip. */
  text: string;
}

export const AWAITING_DEPLOY_LABEL = "awaiting-deploy";

function forBuilding(b: Building): RuleProp[] {
  const props: RuleProp[] = [];
  const room = (r: RoomKind): RuleAnchor => ({ kind: "room", building: b.slug, room: r });
  const leadDesk: RuleAnchor = { kind: "desk", building: b.slug, agent: b.lead.id };

  for (const m of b.milestones)
    if (m.state === "active")
      props.push({
        id: `rule:banner:${b.slug}:${m.id}`,
        rule: "milestone-banner",
        key: "banner",
        anchor: room("lobby"),
        count: null,
        text: `Banner in the lobby: milestone ${m.key} "${m.title}" is active.`,
      });
  for (const r of b.releases) {
    const name = `release ${r.number}${r.version ? ` (${r.version})` : ""}`;
    if (r.state === "draft")
      props.push({
        id: `rule:crate:${b.slug}:${r.id}`,
        rule: "release-crate",
        key: "crate",
        anchor: room("dispatch"),
        count: null,
        text: `Release crate at dispatch: ${name} is a draft.`,
      });
  }
  for (const o of b.objects)
    if (o.labels.includes(AWAITING_DEPLOY_LABEL))
      props.push({
        id: `rule:sticker:${b.slug}:${o.ticketId}`,
        rule: "deploy-sticker",
        key: "sticker.rocket",
        anchor: { kind: "ticket", building: b.slug, ticketKey: o.key },
        count: null,
        text: `Rocket sticker on ${o.key}: labelled ${AWAITING_DEPLOY_LABEL}.`,
      });
  const bugs = b.objects.filter((o) => o.kind === "bug" && o.status !== "done").length;
  if (bugs > 0)
    props.push({
      id: `rule:jar:${b.slug}`,
      rule: "bug-jar",
      key: "jar",
      anchor: leadDesk,
      count: bugs,
      text: `Bug jar on ${b.lead.displayName}'s desk: ${bugs} open bug ticket${bugs === 1 ? "" : "s"}.`,
    });
  for (const r of b.releases)
    if (r.state === "published")
      props.push({
        id: `rule:trophy:${b.slug}:${r.id}`,
        rule: "release-trophy",
        key: "trophy",
        anchor: leadDesk,
        count: null,
        text: `Trophy on ${b.lead.displayName}'s desk: release ${r.number}${r.version ? ` (${r.version})` : ""} is published.`,
      });
  return props;
}

/** The rule props to show now: every switched-on rule over every building that is not archived. */
export function ruleProps(model: WorldModel, rules: TownDocument["rules"]): RuleProp[] {
  return model.buildings.filter((b) => !b.archived).flatMap(forBuilding).filter((p) => rules[p.rule]);
}
