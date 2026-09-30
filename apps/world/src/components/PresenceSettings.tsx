/* The AI-presence block of the Settings card (LOOPS_INTEGRATION_PLAN.md section 7.3, the settings table). In demo mode
   the director switch turns on a scripted feed: no model is called, which the label says. */
import { useEffect, useState } from "react";
import { DIRECTOR_MODEL, PRESENCE_LIMITS, type AmbientMode, type PresenceSettings as Settings } from "@crewhub/world-model";
import { Chip, Field } from "./primitives";
import { directorRuntime, useDirector } from "../state/director";
import "../styles/presence.css";

/** A number box that keeps what is being typed and commits on blur or Enter, so "10" is not clamped at "1". */
function NumberField({ label, value, min, max, hint, onCommit }: { label: string; value: number; min: number; max: number; hint?: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) return setDraft(String(value));
    onCommit(parsed);
    // A clamped value comes back through `value`; when it equals the old one the draft is reset here.
    setDraft(String(Math.min(max, Math.max(min, Math.round(parsed)))));
  };
  return (
    <Field
      label={label}
      size="sm"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      hint={hint ?? `${min} to ${max}`}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

const fmt = (n: number) => n.toLocaleString("en");

export function PresenceSettings() {
  const { settings, usage } = useDirector();
  const set = (patch: Partial<Settings>) => directorRuntime().update(patch);
  const L = PRESENCE_LIMITS;
  return (
    <section className="presence-settings" aria-labelledby="presence-title">
      <h3 id="presence-title" className="presence-title">
        AI presence
      </h3>
      <Field
        control="select"
        size="sm"
        label="Ambient idle variety"
        value={settings.ambient}
        hint="Small idle actions, chosen from a seed. No model."
        onChange={(e) => set({ ambient: e.currentTarget.value as AmbientMode })}
      >
        <option value="on">On</option>
        <option value="reduced">Reduced</option>
        <option value="off">Off</option>
      </Field>
      <Field
        control="checkbox"
        label="Demo: scripted director, no model"
        checked={settings.directorEnabled}
        hint="Off until you switch it on. Plays a fixed script through the director's rules; nothing calls a model."
        onChange={(e) => set({ directorEnabled: e.currentTarget.checked })}
      />
      {usage.capReached && (
        <p className="presence-cap" role="status">
          {usage.capReached === "hour" ? "The hourly plan cap is reached" : "The daily plan cap is reached"}: the director is paused.
        </p>
      )}
      <Field label="Director model" size="sm" readOnly value={DIRECTOR_MODEL} hint="Read-only. Cheap models only, no escalation. The demo never calls it." />
      <NumberField label="Scheduled plan every (minutes)" value={settings.intervalMinutes} min={L.intervalMinMinutes} max={L.intervalMaxMinutes} hint={`Minimum ${L.intervalMinMinutes} minutes`} onCommit={(v) => set({ intervalMinutes: v })} />
      <Field control="checkbox" label="Quick plans" checked={settings.quickPlans} hint="After a ticket move or a status change: 20 s debounce, one per building per minute." onChange={(e) => set({ quickPlans: e.currentTarget.checked })} />
      <div className="presence-pair">
        <NumberField label="Plans per hour" value={settings.plansPerHour} min={1} max={L.plansPerHourMax} onCommit={(v) => set({ plansPerHour: v })} />
        <NumberField label="Plans per day" value={settings.plansPerDay} min={1} max={L.plansPerDayMax} onCommit={(v) => set({ plansPerDay: v })} />
        <NumberField label="Input tokens" value={settings.inputBudget} min={100} max={L.inputBudgetMax} onCommit={(v) => set({ inputBudget: v })} />
        <NumberField label="Output tokens" value={settings.outputBudget} min={20} max={L.outputBudgetMax} onCommit={(v) => set({ outputBudget: v })} />
      </div>
      <dl className="presence-usage" aria-label="Director usage">
        <dt>Plans today</dt>
        <dd>{fmt(usage.plansToday)}</dd>
        <dt>Intents accepted</dt>
        <dd>{fmt(usage.intentsAccepted)}</dd>
        <dt>Intents rejected</dt>
        <dd>{fmt(usage.intentsRejected)}</dd>
        <dt>Estimated input tokens</dt>
        <dd>{fmt(usage.inputTokens)}</dd>
        <dt>Model calls</dt>
        <dd>
          <Chip>0, always</Chip>
        </dd>
      </dl>
    </section>
  );
}
