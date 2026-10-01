/* The director in the text view: each plan with its trigger, building, estimated input size and rejections, then the
   intents that were played ("director: cr-dev-1 goes to the coffee machine in the lobby"). Demo only. */
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
  const { settings, plans } = useDirector();
  const played = useSyncExternalStore(subscribeIntents, playedIntents);
  const buildingName = (slug: string) => model.buildings.find((b) => b.slug === slug)?.name ?? slug;
  if (!settings.directorEnabled && plans.length === 0) {
    return (
      <section className="text-section">
        <h3>Director</h3>
        <ul>
          <li>
            <span className="text-kind" data-kind="demo">demo</span>
            <span>The scripted director is off. Switch it on in Settings; it calls no model.</span>
          </li>
        </ul>
      </section>
    );
  }
  return (
    <>
      <section className="text-section">
        <h3>Director plans</h3>
        <ul>
          {plans.slice(0, SHOWN_PLANS).flatMap((plan) => [
            <li key={plan.id}>
              <span className="text-kind" data-kind="demo">demo</span>
              <span>
                Plan {plan.id} ({plan.trigger}, {plan.reason}) for {buildingName(plan.building)}: input about {plan.inputTokens} tokens, {plan.accepted.length} accepted, {plan.rejected.length} rejected.
              </span>
            </li>,
            ...plan.rejected.map((r, i) => (
              <li key={`${plan.id}-r${i}`}>
                <span className="text-kind" data-kind="demo">demo</span>
                <span>Rejected {summary(r.intent)}: {r.reason}.</span>
              </li>
            )),
          ])}
          {plans.length === 0 && (
            <li>
              <span className="text-kind" data-kind="demo">demo</span>
              <span>No plan yet: the first one comes with the next scheduled interval or a ticket move.</span>
            </li>
          )}
        </ul>
      </section>
      {played.length > 0 && (
        <section className="text-section">
          <h3>Director intents</h3>
          <ul>
            {played.slice(0, 12).map((p) => (
              <li key={p.id}>
                <span className="text-kind" data-kind="demo">demo</span>
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
