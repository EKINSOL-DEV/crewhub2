// Wizard overlay (M6 T8, EKI-86): fresh-profile gating, skip-everywhere,
// resume from the persisted step, detect-step branches (found / missing with
// manual path picker re-probe), settings-panel re-run.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { OnboardingWizard } from "@/onboarding/Wizard";
import type { EnvReport } from "@/ipc/bindings";
import { useOnboarding } from "@/stores/onboarding";

afterEach(() => {
  cleanup();
  clearMocks();
  useOnboarding.getState().reset();
});

const FOUND: EnvReport = {
  cli_path: "/opt/homebrew/bin/claude",
  cli_version: "claude 2.1.0",
  claude_dir: true,
  claude_projects: true,
  v1_db: null,
};

const MISSING: EnvReport = {
  cli_path: null,
  cli_version: null,
  claude_dir: false,
  claude_projects: false,
  v1_db: null,
};

interface MockOpts {
  settings?: Record<string, string>;
  env?: EnvReport;
  onSet?: (key: string, value: string) => void;
  setCliPath?: (path: string) => string | null;
}

function mockBackend(opts: MockOpts = {}) {
  const settings = { ...(opts.settings ?? {}) };
  mockIPC((cmd, args) => {
    if (cmd === "get_setting") return settings[(args as { key: string }).key] ?? null;
    if (cmd === "set_setting") {
      const { key, value } = args as { key: string; value: string };
      settings[key] = value;
      opts.onSet?.(key, value);
      return null;
    }
    if (cmd === "detect_environment") return opts.env ?? MISSING;
    if (cmd === "set_cli_path") {
      if (!opts.setCliPath) throw new Error("unexpected set_cli_path");
      return opts.setCliPath((args as { path: string }).path);
    }
    return null;
  });
  return settings;
}

test("fresh profile (no onboarding.state) shows the wizard at welcome", async () => {
  mockBackend();
  render(<OnboardingWizard />);
  expect(await screen.findByTestId("onboarding-wizard")).toBeInTheDocument();
  expect(screen.getByTestId("wizard-step-welcome")).toBeInTheDocument();
});

test.each(["done", "skipped"])("onboarding.state=%s boots straight into the shell", async (state) => {
  mockBackend({ settings: { "onboarding.state": state } });
  render(<OnboardingWizard />);
  await waitFor(() => expect(useOnboarding.getState().loaded).toBe(true));
  expect(screen.queryByTestId("onboarding-wizard")).toBeNull();
});

test("quitting mid-wizard resumes at onboarding.step", async () => {
  mockBackend({ settings: { "onboarding.step": "crew" } });
  render(<OnboardingWizard />);
  expect(await screen.findByTestId("wizard-step-crew")).toBeInTheDocument();
});

test("Continue advances and persists the step for resume", async () => {
  const writes: Array<[string, string]> = [];
  mockBackend({ onSet: (k, v) => writes.push([k, v]), env: FOUND });
  render(<OnboardingWizard />);
  fireEvent.click(await screen.findByTestId("wizard-next"));
  expect(await screen.findByTestId("wizard-step-detect")).toBeInTheDocument();
  await waitFor(() => expect(writes).toContainEqual(["onboarding.step", "detect"]));
});

test("Back returns to the previous step", async () => {
  mockBackend({ settings: { "onboarding.step": "projects" }, env: FOUND });
  render(<OnboardingWizard />);
  fireEvent.click(await screen.findByTestId("wizard-back"));
  expect(await screen.findByTestId("wizard-step-detect")).toBeInTheDocument();
});

test("Skip writes onboarding.state=skipped and lands in the shell", async () => {
  const writes: Array<[string, string]> = [];
  mockBackend({ onSet: (k, v) => writes.push([k, v]) });
  render(<OnboardingWizard />);
  fireEvent.click(await screen.findByTestId("wizard-skip"));
  await waitFor(() => expect(screen.queryByTestId("onboarding-wizard")).toBeNull());
  expect(writes).toContainEqual(["onboarding.state", "skipped"]);
});

test("detect: found branch shows path + version and the ~/.claude status", async () => {
  mockBackend({ settings: { "onboarding.step": "detect" }, env: FOUND });
  render(<OnboardingWizard />);
  expect(await screen.findByTestId("detect-found")).toBeInTheDocument();
  expect(screen.getByText("/opt/homebrew/bin/claude")).toBeInTheDocument();
  expect(screen.getByText("claude 2.1.0")).toBeInTheDocument();
  expect(screen.getByText(/~\/.claude exists/)).toBeInTheDocument();
});

test("detect: missing branch is a first-class screen with install guidance", async () => {
  mockBackend({ settings: { "onboarding.step": "detect" }, env: MISSING });
  render(<OnboardingWizard />);
  expect(await screen.findByTestId("detect-missing")).toBeInTheDocument();
  expect(screen.getByText(/npm install -g @anthropic-ai\/claude-code/)).toBeInTheDocument();
  expect(screen.getByTestId("cli-path-input")).toBeInTheDocument();
});

test("manual path picker re-probes through set_cli_path and lands on found", async () => {
  let env = MISSING;
  mockBackend({
    settings: { "onboarding.step": "detect" },
    get env() {
      return env;
    },
    setCliPath: () => {
      env = FOUND; // the backend persisted the path; next detect finds it
      return "claude 2.1.0";
    },
  });
  render(<OnboardingWizard />);
  fireEvent.change(await screen.findByTestId("cli-path-input"), {
    target: { value: "/weird/place/claude" },
  });
  fireEvent.click(screen.getByTestId("cli-path-apply"));
  expect(await screen.findByTestId("detect-found")).toBeInTheDocument();
});

test("manual path picker surfaces a probe failure without leaving the step", async () => {
  mockBackend({
    settings: { "onboarding.step": "detect" },
    env: MISSING,
    setCliPath: () => {
      throw "that binary didn't answer --version";
    },
  });
  render(<OnboardingWizard />);
  fireEvent.change(await screen.findByTestId("cli-path-input"), { target: { value: "/bad/claude" } });
  fireEvent.click(screen.getByTestId("cli-path-apply"));
  expect(await screen.findByTestId("cli-path-error")).toHaveTextContent(/didn't answer/);
  expect(screen.getByTestId("detect-missing")).toBeInTheDocument();
});

test("rerun() re-arms the wizard at welcome (settings-panel button path)", async () => {
  mockBackend({ settings: { "onboarding.state": "done" } });
  render(<OnboardingWizard />);
  await waitFor(() => expect(useOnboarding.getState().loaded).toBe(true));
  expect(screen.queryByTestId("onboarding-wizard")).toBeNull();
  useOnboarding.getState().rerun();
  expect(await screen.findByTestId("wizard-step-welcome")).toBeInTheDocument();
});
