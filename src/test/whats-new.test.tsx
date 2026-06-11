// "What's new" (M6 T11, EKI-100 / D-M6-7, Fresh Paint): pending notes open
// the dialog once (clear + last_seen advance on BOTH buttons — Later never
// nags twice); with no notes a version bump toasts "Updated to vX"; a fresh
// install records the version silently; junk in the key is ignored.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { LAST_SEEN_VERSION_KEY, PENDING_NOTES_KEY, WhatsNewDialog } from "@/components/WhatsNewDialog";
import { useToasts } from "@/stores/toasts";

afterEach(() => {
  cleanup();
  clearMocks();
  useToasts.getState().reset();
});

function mockBackend(opts: { settings?: Record<string, string>; version?: string }) {
  const settings = { ...(opts.settings ?? {}) };
  const writes: Array<[string, string]> = [];
  mockIPC((cmd, args) => {
    if (cmd === "get_setting") return settings[(args as { key: string }).key] ?? null;
    if (cmd === "set_setting") {
      const { key, value } = args as { key: string; value: string };
      settings[key] = value;
      writes.push([key, value]);
      return null;
    }
    if (cmd === "app_info") return { version: opts.version ?? "2.0.0", data_dir: "/tmp" };
    return null;
  });
  return { settings, writes };
}

test.each(["whats-new-close", "whats-new-later"])(
  "pending notes show the Fresh Paint dialog once — %s clears + advances last_seen",
  async (button) => {
    const { settings, writes } = mockBackend({
      settings: {
        [PENDING_NOTES_KEY]: JSON.stringify({ version: "2.1.0", notes: "## Shiny\n- tray mood" }),
      },
    });
    render(<WhatsNewDialog />);
    const dialog = await screen.findByTestId("whats-new-dialog");
    expect(dialog).toHaveTextContent("✨ Fresh paint — what's new in v2.1.0");
    expect(dialog).toHaveTextContent("tray mood"); // notes through shared Markdown
    fireEvent.click(screen.getByTestId(button));
    expect(screen.queryByTestId("whats-new-dialog")).toBeNull();
    await waitFor(() => expect(writes).toContainEqual([LAST_SEEN_VERSION_KEY, "2.1.0"]));
    expect(settings[PENDING_NOTES_KEY]).toBe(""); // cleared — never nags twice
  },
);

test("no pending notes + version bump = a notes-less 'Updated to vX' toast", async () => {
  const { writes } = mockBackend({
    settings: { [LAST_SEEN_VERSION_KEY]: "2.0.0" },
    version: "2.0.1",
  });
  render(<WhatsNewDialog />);
  await waitFor(() => expect(useToasts.getState().toasts).toHaveLength(1));
  expect(useToasts.getState().toasts[0]!.text).toBe("Updated to v2.0.1");
  expect(screen.queryByTestId("whats-new-dialog")).toBeNull();
  await waitFor(() => expect(writes).toContainEqual([LAST_SEEN_VERSION_KEY, "2.0.1"]));
});

test("fresh install records the version silently — first boot is not an update", async () => {
  const { writes } = mockBackend({ version: "2.0.0" });
  render(<WhatsNewDialog />);
  await waitFor(() => expect(writes).toContainEqual([LAST_SEEN_VERSION_KEY, "2.0.0"]));
  expect(useToasts.getState().toasts).toHaveLength(0);
  expect(screen.queryByTestId("whats-new-dialog")).toBeNull();
});

test("same version, nothing pending: completely quiet", async () => {
  const { writes } = mockBackend({
    settings: { [LAST_SEEN_VERSION_KEY]: "2.0.0" },
    version: "2.0.0",
  });
  render(<WhatsNewDialog />);
  // settle the boot probe
  await waitFor(() => expect(screen.queryByTestId("whats-new-dialog")).toBeNull());
  expect(useToasts.getState().toasts).toHaveLength(0);
  expect(writes).toHaveLength(0);
});

test("junk in updater.pending_notes is ignored, not crashed on", async () => {
  mockBackend({
    settings: { [PENDING_NOTES_KEY]: "{not json", [LAST_SEEN_VERSION_KEY]: "2.0.0" },
    version: "2.0.0",
  });
  render(<WhatsNewDialog />);
  await waitFor(() => expect(screen.queryByTestId("whats-new-dialog")).toBeNull());
  expect(useToasts.getState().toasts).toHaveLength(0);
});
