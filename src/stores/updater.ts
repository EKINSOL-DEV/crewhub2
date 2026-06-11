// Updater UI state (M6 T11, EKI-100 / D-M6-7): thin store over Lane 0's
// typed updater IPC — `check_for_update` / `install_update` are Rust-side
// (no webview updater grant). Shared by the settings Updates section and
// the palette's "Check for updates" action so both show the same state.
import { create } from "zustand";
import { commands, type UpdateInfo } from "@/ipc/bindings";

interface UpdaterState {
  checking: boolean;
  /** Result of the last check: an update, or null for "up to date". */
  available: UpdateInfo | null;
  /** Epoch ms of the last completed check (null = never checked). */
  checkedAt: number | null;
  installing: boolean;
  error: string | null;
  check: () => Promise<UpdateInfo | null>;
  /** Downloads, verifies, installs, relaunches — only returns on failure. */
  install: () => Promise<void>;
  reset: () => void;
}

export const useUpdater = create<UpdaterState>((set) => ({
  checking: false,
  available: null,
  checkedAt: null,
  installing: false,
  error: null,

  check: async () => {
    set({ checking: true, error: null });
    try {
      const res = await commands.checkForUpdate();
      if (res.status === "ok") {
        set({ checking: false, available: res.data, checkedAt: Date.now() });
        return res.data;
      }
      set({ checking: false, error: res.error, checkedAt: Date.now() });
      return null;
    } catch (e) {
      set({ checking: false, error: String(e), checkedAt: Date.now() });
      return null;
    }
  },

  install: async () => {
    set({ installing: true, error: null });
    try {
      const res = await commands.installUpdate();
      // install_update only returns on failure (success relaunches the app)
      set({ installing: false, error: res.status === "error" ? res.error : null });
    } catch (e) {
      set({ installing: false, error: String(e) });
    }
  },

  reset: () => set({ checking: false, available: null, checkedAt: null, installing: false, error: null }),
}));
