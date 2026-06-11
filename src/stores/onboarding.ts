// Onboarding store (M6 T8, EKI-86 / D-M6-2): owns the wizard's two settings
// keys (`onboarding.state`, `onboarding.step`) plus the in-flight wizard data
// (environment report, projects created so far, the sample crew result).
// Cross-window: a settings-window "Re-run setup wizard" writes the keys and
// the main window reconciles on `SettingChanged` — same discipline as the
// settings store (Appendix B).
import { create } from "zustand";
import { commands, type EnvReport, type SampleCrewResult } from "@/ipc/bindings";
import { onDomainEvent } from "@/ipc/events";
import {
  initialStep,
  shouldShowWizard,
  ONBOARDING_STATE_KEY,
  ONBOARDING_STEP_KEY,
  type WizardStep,
} from "@/onboarding/step-machine";

async function readSetting(key: string): Promise<string | null> {
  const res = await commands.getSetting(key);
  return res.status === "ok" ? res.data : null;
}

function persist(key: string, value: string) {
  return commands.setSetting(key, value).catch(() => undefined);
}

interface OnboardingStore {
  /** True when the overlay should cover the shell. */
  show: boolean;
  step: WizardStep;
  loaded: boolean;
  /** Detect-step result; null until the probe ran. */
  env: EnvReport | null;
  detecting: boolean;
  /** Projects registered during this wizard run (MCP step works off these). */
  createdProjectIds: string[];
  sampleCrew: SampleCrewResult | null;

  load: () => Promise<void>;
  goTo: (step: WizardStep) => void;
  /** "Skip setup": state=skipped, overlay dissolves into the shell. */
  skip: () => void;
  /** Finish: state=done. */
  complete: () => void;
  /** Settings-panel "Re-run setup wizard": resets the two keys. */
  rerun: () => void;
  /** Run (or re-run) the environment probe (detect step / manual re-probe). */
  detect: () => Promise<void>;
  addCreatedProject: (id: string) => void;
  setSampleCrew: (r: SampleCrewResult) => void;
  reset: () => void;
}

let started = false;

export const useOnboarding = create<OnboardingStore>((set, get) => ({
  show: false,
  step: "welcome",
  loaded: false,
  env: null,
  detecting: false,
  createdProjectIds: [],
  sampleCrew: null,

  load: async () => {
    if (started) return;
    started = true;
    try {
      const [state, step] = await Promise.all([
        readSetting(ONBOARDING_STATE_KEY),
        readSetting(ONBOARDING_STEP_KEY),
      ]);
      set({ show: shouldShowWizard(state), step: initialStep(step), loaded: true });
    } catch {
      // backend unavailable (unit tests): can't know the state — never block the shell
      set({ show: false, loaded: true });
    }
    try {
      await onDomainEvent((e) => {
        // Reconcile a re-run (or skip) written from the settings window.
        if (e.type === "SettingChanged" && e.data.key === ONBOARDING_STATE_KEY) {
          void readSetting(ONBOARDING_STATE_KEY).then((state) => {
            const show = shouldShowWizard(state);
            if (show !== get().show) set({ show, ...(show ? { step: "welcome" as const } : {}) });
          });
        }
      });
    } catch {
      // event bridge unavailable (unit tests)
    }
  },

  goTo: (step) => {
    set({ step });
    void persist(ONBOARDING_STEP_KEY, step); // resumable on next launch
  },

  skip: () => {
    set({ show: false });
    void persist(ONBOARDING_STATE_KEY, "skipped");
  },

  complete: () => {
    set({ show: false });
    void persist(ONBOARDING_STATE_KEY, "done");
  },

  rerun: () => {
    set({ show: true, step: "welcome", env: null, createdProjectIds: [], sampleCrew: null });
    void persist(ONBOARDING_STATE_KEY, "pending");
    void persist(ONBOARDING_STEP_KEY, "welcome");
  },

  detect: async () => {
    set({ detecting: true });
    try {
      const res = await commands.detectEnvironment();
      set({ env: res.status === "ok" ? res.data : null, detecting: false });
    } catch {
      set({ env: null, detecting: false });
    }
  },

  addCreatedProject: (id) =>
    set((s) => ({
      createdProjectIds: s.createdProjectIds.includes(id)
        ? s.createdProjectIds
        : [...s.createdProjectIds, id],
    })),

  setSampleCrew: (r) => set({ sampleCrew: r }),

  reset: () => {
    started = false;
    set({
      show: false,
      step: "welcome",
      loaded: false,
      env: null,
      detecting: false,
      createdProjectIds: [],
      sampleCrew: null,
    });
  },
}));
