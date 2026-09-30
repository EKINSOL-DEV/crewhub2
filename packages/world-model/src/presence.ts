/**
 * AI-presence settings (LOOPS_INTEGRATION_PLAN.md section 7.3, the settings table). Pure: parsing and clamping
 * only; the app owns storage. Every bound is the plan's own number, so a stored value can lower a limit
 * but never raise it above the plan.
 */

export type AmbientMode = "off" | "reduced" | "on";

export interface PresenceSettings {
  /** Deterministic idle variety (plan 7.1). */
  ambient: AmbientMode;
  /** Off until a person switches it on. In demo mode it turns the scripted feed on. */
  directorEnabled: boolean;
  /** Scheduled plan interval, minutes. Minimum 2. */
  intervalMinutes: number;
  quickPlans: boolean;
  plansPerHour: number;
  plansPerDay: number;
  /** Tokens, estimated as characters / 4. */
  inputBudget: number;
  outputBudget: number;
}

/** Read-only: cheap models only, no escalation (plan 7.3). */
export const DIRECTOR_MODEL = "claude-haiku-4-5-20251001";

export const PRESENCE_LIMITS = {
  intervalMinMinutes: 2,
  intervalMaxMinutes: 60,
  plansPerHourMax: 40,
  plansPerDayMax: 400,
  inputBudgetMax: 1500,
  outputBudgetMax: 200,
} as const;

export const DEFAULT_PRESENCE: PresenceSettings = {
  ambient: "on",
  directorEnabled: false,
  intervalMinutes: 5,
  quickPlans: true,
  plansPerHour: PRESENCE_LIMITS.plansPerHourMax,
  plansPerDay: PRESENCE_LIMITS.plansPerDayMax,
  inputBudget: PRESENCE_LIMITS.inputBudgetMax,
  outputBudget: PRESENCE_LIMITS.outputBudgetMax,
};

function whole(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Anything goes in (a parsed localStorage value, a form draft); a valid, clamped settings object comes out. */
export function normalizePresence(raw: unknown): PresenceSettings {
  const d = DEFAULT_PRESENCE;
  const o: Record<string, unknown> = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const L = PRESENCE_LIMITS;
  return {
    ambient: o.ambient === "off" || o.ambient === "reduced" || o.ambient === "on" ? o.ambient : d.ambient,
    directorEnabled: o.directorEnabled === true,
    intervalMinutes: whole(o.intervalMinutes, L.intervalMinMinutes, L.intervalMaxMinutes, d.intervalMinutes),
    quickPlans: typeof o.quickPlans === "boolean" ? o.quickPlans : d.quickPlans,
    plansPerHour: whole(o.plansPerHour, 1, L.plansPerHourMax, d.plansPerHour),
    plansPerDay: whole(o.plansPerDay, 1, L.plansPerDayMax, d.plansPerDay),
    inputBudget: whole(o.inputBudget, 100, L.inputBudgetMax, d.inputBudget),
    outputBudget: whole(o.outputBudget, 20, L.outputBudgetMax, d.outputBudget),
  };
}
