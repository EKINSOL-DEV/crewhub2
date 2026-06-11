// Updater UI (M6 T11, EKI-100): store states over check_for_update /
// install_update, the settings Updates section (check now → version status →
// install + relaunch states), and the notification rules section's M6
// upgrades (sink picker, seed-defaults button, Quiet Inbox empty state).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { NotificationRulesSection } from "@/panels/board/NotificationRulesSection";
import { useToasts } from "@/stores/toasts";
import { useUpdater } from "@/stores/updater";
import { notificationRule } from "./fixtures";

afterEach(() => {
  cleanup();
  clearMocks();
  useUpdater.getState().reset();
  useToasts.getState().reset();
});

// ── store ────────────────────────────────────────────────────────────────────

test("check(): update available → stored; null → up to date; throw → error", async () => {
  let answer: unknown = { version: "2.1.0", notes: "notes", date: null };
  mockIPC((cmd) => {
    if (cmd === "check_for_update") {
      if (answer instanceof Error) throw answer.message;
      return answer;
    }
    return null;
  });
  expect(await useUpdater.getState().check()).toMatchObject({ version: "2.1.0" });
  expect(useUpdater.getState().available?.version).toBe("2.1.0");

  answer = null;
  expect(await useUpdater.getState().check()).toBeNull();
  expect(useUpdater.getState().available).toBeNull();
  expect(useUpdater.getState().checkedAt).not.toBeNull();

  answer = new Error("endpoint unreachable");
  await useUpdater.getState().check();
  expect(useUpdater.getState().error).toContain("endpoint unreachable");
});

test("install(): only returns on failure — the error lands in state", async () => {
  mockIPC((cmd) => {
    if (cmd === "install_update") throw "signature verification failed";
    return null;
  });
  await useUpdater.getState().install();
  expect(useUpdater.getState().installing).toBe(false);
  expect(useUpdater.getState().error).toContain("signature");
});

// ── settings Updates section ─────────────────────────────────────────────────

async function renderUpdates() {
  const { default: SettingsPanel } = await import("@/panels/settings/SettingsPanel");
  return render(<SettingsPanel />);
}

test("Updates section: check now → install button with downloading state", async () => {
  let installCalled = false;
  mockIPC((cmd) => {
    if (cmd === "app_info") return { version: "2.0.0", data_dir: "/tmp" };
    if (cmd === "check_for_update") return { version: "2.1.0", notes: "Tray Mood ✨", date: null };
    if (cmd === "install_update") {
      installCalled = true;
      return new Promise(() => {}); // never resolves: the app would relaunch
    }
    return [];
  });
  await renderUpdates();
  fireEvent.click(await screen.findByTestId("check-updates"));
  const install = await screen.findByTestId("install-update");
  expect(install).toHaveTextContent("Install v2.1.0 & relaunch");
  expect(screen.getByTestId("update-notes")).toHaveTextContent("Tray Mood");
  fireEvent.click(install);
  await waitFor(() => expect(installCalled).toBe(true));
  expect(screen.getByTestId("install-update")).toHaveTextContent("Downloading");
});

test("Updates section: up-to-date state after a null check", async () => {
  mockIPC((cmd) => {
    if (cmd === "app_info") return { version: "2.0.0", data_dir: "/tmp" };
    if (cmd === "check_for_update") return null;
    return [];
  });
  await renderUpdates();
  fireEvent.click(await screen.findByTestId("check-updates"));
  expect(await screen.findByTestId("up-to-date")).toBeInTheDocument();
  expect(screen.queryByTestId("install-update")).toBeNull();
});

// ── notification rules section: M6 upgrades ──────────────────────────────────

test("rules section: Quiet Inbox empty state + sink picker + seed defaults", async () => {
  let rules = [notificationRule({ id: "r1", trigger: "permission_needed", config_json: '{"sink":"both"}' })];
  const updates: Array<{ config_json: string | null }> = [];
  let seeded = false;
  mockIPC((cmd, args) => {
    if (cmd === "list_notification_rules") return rules;
    if (cmd === "update_notification_rule") {
      const rule = (args as { rule: (typeof rules)[number] }).rule;
      updates.push({ config_json: rule.config_json });
      rules = rules.map((r) => (r.id === rule.id ? rule : r));
      return rule;
    }
    if (cmd === "seed_default_notification_rules") {
      seeded = true;
      return [];
    }
    return [];
  });
  render(<NotificationRulesSection />);
  const picker = await screen.findByLabelText("Sink for rule ✋ permission needed");
  expect(picker).toHaveValue("both");
  fireEvent.change(picker, { target: { value: "toast" } });
  await waitFor(() => expect(updates).toHaveLength(1));
  expect(JSON.parse(updates[0]!.config_json!)).toEqual({ sink: "toast" });

  fireEvent.click(screen.getByTestId("seed-default-rules"));
  await waitFor(() => expect(seeded).toBe(true));

  // Quiet Inbox empty state copy (D-M6-12)
  cleanup();
  useToasts.getState().reset();
  rules = [];
  render(<NotificationRulesSection />);
  expect(await screen.findByTestId("no-rules")).toHaveTextContent(
    "🔕 nothing will interrupt you — add a rule to change that",
  );
});

test("rules section: the five attention triggers are offered in the picker", async () => {
  mockIPC(() => []);
  render(<NotificationRulesSection />);
  const select = await screen.findByLabelText("New rule trigger");
  const options = [...select.querySelectorAll("option")].map((o) => o.getAttribute("value"));
  for (const t of [
    "permission_needed",
    "session_stopped",
    "session_error",
    "meeting_complete",
    "hook_notification",
  ]) {
    expect(options).toContain(t);
  }
});
