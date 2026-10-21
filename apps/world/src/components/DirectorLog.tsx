/* The director in the text view: each plan with its trigger, building, estimated input size and rejections, then the
   intents that were played ("director: cr-dev-1 goes to the coffee machine in the lobby"). Every line carries the mode's
   tag: "demo" in demo mode, "scripted" in live mode, where the same script plays over real facts and must never read as
   real behaviour. */
import { useSyncExternalStore } from "react";
import { playedIntents, subscribeIntents } from "../world/intentPlayer";
import { useDirector } from "../state/director";
import { useWorld } from "../state/world";

const SHOWN_PLANS = 8;

function summary(raw: unknown): string {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const who = Array.isArray(o.agents) ? o.agents.join(", ") : String(o.agent ?? "?");
  return `${String(o.kind ?? "unknown")} for ${who}`;
}

export function DirectorLog() {
  const { model } = useWorld();
  const { enabled, plans } = useDirector();
  const played = useSyncExternalStore(subscribeIntents, playedIntents);
  const buildingName = (slug: string) => model.buildings.find((b) => b.slug === slug)?.name ?? slug;
  const live = model.mode === "live";
  const kind = live ? "scripted" : "demo";
  const tag = <span className="text-kind" data-kind={kind}>{kind}</span>;
  const title = live ? "Scripted director" : "Director";
  if (!enabled && plans.length === 0) {
    return (
      <section className="text-section">
        <h3>{title}</h3>
        <ul>
          <li>
            {tag}
            <span>
              {live
                ? "The scripted director is off. Switch it on in Settings; it calls no model, plays a fixed script over the live facts and moves only the figures here, never anything in crewhub-loops."
                : "The scripted director is off. Switch it on in Settings; it calls no model."}
            </span>
          </li>
        </ul>
      </section>
    );
  }
  return (
    <>
      <section className="text-section">
        <h3>{title} plans</h3>
        <ul>
          {!enabled && (
            <li>
              {tag}
              <span>The scripted director is off: these plans are from before the switch, and no intent of theirs steers anyone.</span>
            </li>
          )}
          {plans.slice(0, SHOWN_PLANS).flatMap((plan) => [
            <li key={plan.id}>
              {tag}
              <span>
                Plan {plan.id} ({plan.trigger}, {plan.reason}) for {buildingName(plan.building)}: input about {plan.inputTokens} tokens, {plan.accepted.length} accepted, {plan.rejected.length} rejected.
              </span>
            </li>,
            ...plan.rejected.map((r, i) => (
              <li key={`${plan.id}-r${i}`}>
                {tag}
                <span>Rejected {summary(r.intent)}: {r.reason}.</span>
              </li>
            )),
          ])}
          {plans.length === 0 && (
            <li>
              {tag}
              <span>No plan yet: the first one comes with the next scheduled interval or a ticket move.</span>
            </li>
          )}
        </ul>
      </section>
      {played.length > 0 && (
        <section className="text-section">
          <h3>{title} intents</h3>
          <ul>
            {played.slice(0, 12).map((p) => (
              <li key={p.id}>
                {tag}
                <span>
                  {p.text}
                  {p.expiresAt <= model.now ? " (lapsed)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
