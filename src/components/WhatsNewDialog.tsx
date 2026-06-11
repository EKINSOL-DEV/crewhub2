// "What's new" (M6 T11, EKI-100 / D-M6-7, Fresh Paint): on boot, a persisted
// `updater.pending_notes` (written by install_update before relaunch) opens
// this dialog once — release notes through the shared Markdown, sparkle
// header, then the key is cleared and `app.last_seen_version` advances, so
// neither "Nice" nor "Later" ever nags twice for the same version. With no
// pending notes, a version bump since `app.last_seen_version` (manual
// install of a newer build) gets a notes-less "Updated to vX" toast; a
// genuinely fresh install just records the version silently.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/Markdown";
import { commands } from "@/ipc/bindings";
import { useToasts } from "@/stores/toasts";

export const PENDING_NOTES_KEY = "updater.pending_notes";
export const LAST_SEEN_VERSION_KEY = "app.last_seen_version";

interface PendingNotes {
  version: string;
  notes: string | null;
}

function parsePending(raw: string | null): PendingNotes | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const { version, notes } = v as { version?: unknown; notes?: unknown };
    if (typeof version !== "string" || version === "") return null;
    return { version, notes: typeof notes === "string" ? notes : null };
  } catch {
    return null;
  }
}

async function readSetting(key: string): Promise<string | null> {
  const res = await commands.getSetting(key);
  return res.status === "ok" ? res.data : null;
}

export function WhatsNewDialog() {
  const [pending, setPending] = useState<PendingNotes | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const notes = parsePending(await readSetting(PENDING_NOTES_KEY));
        if (notes) {
          if (!cancelled) setPending(notes);
          return;
        }
        // No pending notes: compare last-seen to the running version.
        const info = await commands.appInfo();
        const lastSeen = await readSetting(LAST_SEEN_VERSION_KEY);
        if (lastSeen === null) {
          // fresh install — record silently, a first boot is not an update
          void commands.setSetting(LAST_SEEN_VERSION_KEY, info.version).catch(() => undefined);
        } else if (lastSeen !== info.version && !cancelled) {
          useToasts.getState().push({
            emoji: "✨",
            text: `Updated to v${info.version}`,
            taskId: null,
            shake: false,
            action: null,
          });
          void commands.setSetting(LAST_SEEN_VERSION_KEY, info.version).catch(() => undefined);
        }
      } catch {
        // backend unavailable (unit tests) — nothing to announce
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending) return null;

  function close() {
    // clear-then-mark: neither button nags twice for this version
    void commands.setSetting(PENDING_NOTES_KEY, "").catch(() => undefined);
    void commands.setSetting(LAST_SEEN_VERSION_KEY, pending!.version).catch(() => undefined);
    setPending(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        data-testid="whats-new-dialog"
        role="dialog"
        aria-label="What's new"
        className="flex max-h-full w-full max-w-lg flex-col gap-3 rounded-md border bg-card p-4 shadow-xl"
      >
        <h2 className="text-base font-semibold">✨ Fresh paint — what's new in v{pending.version}</h2>
        <div className="min-h-0 flex-1 overflow-y-auto text-sm">
          {pending.notes ? (
            <Markdown text={pending.notes} />
          ) : (
            <p className="text-muted-foreground">Updated to v{pending.version}.</p>
          )}
        </div>
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" data-testid="whats-new-later" onClick={close}>
            Later
          </Button>
          <Button size="sm" data-testid="whats-new-close" onClick={close}>
            Nice ✨
          </Button>
        </div>
      </div>
    </div>
  );
}
