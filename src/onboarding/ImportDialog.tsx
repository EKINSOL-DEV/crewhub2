// Import-from-v1 dialog (M6 T10, EKI-106 / D-M6-8): dry-run preview as a
// Moving Day table (📦 moved in / 🚫 left behind, skip reasons in plain
// words), then the real run — same Rust code path, one transaction, v1 file
// never written. Blueprints come back raw and are converted CLIENT-SIDE
// through the existing fixture-tested `parse-v1.ts` → `serializeRoomProps`
// → `world.props:<room_id>` KV writes (room ids preserved by the importer,
// so the keys line up). Second runs show all-skipped honestly.
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { commands, type ImportReport, type TableReport } from "@/ipc/bindings";
import { ROOM_SIZE } from "@/panels/world/lib/layout";
import { parseV1Blueprint } from "@/panels/world/props/parse-v1";
import { propsSettingKey, serializeRoomProps } from "@/panels/world/props/placement";

// ── Pure: blueprint conversion leg (§3.2 round-trip, frontend half) ─────────

export interface BlueprintOutcome {
  name: string;
  roomId: string | null;
  /** Settings-KV write performed (room id present + parse succeeded). */
  ok: boolean;
  detail: string | null;
}

/**
 * Convert the report's raw v1 blueprint rows and write each successful one to
 * `world.props:<room_id>`. Pure-ish: all IPC goes through the injected
 * `write` so tests can capture the KV writes.
 */
export async function applyBlueprints(
  report: ImportReport,
  write: (key: string, value: string) => Promise<unknown> = (k, v) =>
    commands.setSetting(k, v).catch(() => undefined),
): Promise<BlueprintOutcome[]> {
  const out: BlueprintOutcome[] = [];
  for (const bp of report.blueprints) {
    if (!bp.room_id) {
      out.push({ name: bp.name, roomId: null, ok: false, detail: "no room to land in" });
      continue;
    }
    const parsed = parseV1Blueprint(bp.blueprint_json, { width: ROOM_SIZE, depth: ROOM_SIZE });
    if (!parsed.ok) {
      out.push({ name: bp.name, roomId: bp.room_id, ok: false, detail: parsed.error });
      continue;
    }
    await write(propsSettingKey(bp.room_id), serializeRoomProps(parsed.props));
    out.push({
      name: bp.name,
      roomId: bp.room_id,
      ok: true,
      detail: parsed.warnings.length > 0 ? parsed.warnings.join("; ") : null,
    });
  }
  return out;
}

// ── Moving Day rows ──────────────────────────────────────────────────────────

function MovingDayRow({ t }: { t: TableReport }) {
  return (
    <li className="flex flex-col gap-0.5 rounded border px-2 py-1 text-xs" data-testid={`import-${t.table}`}>
      <span>
        📦 {t.will_import} of {t.found} {t.table.split("_").join(" ")} moving in
      </span>
      {t.skipped.map((s) => (
        <span key={s.reason} className="text-muted-foreground">
          🚫 {s.count} left behind — {s.reason}
        </span>
      ))}
    </li>
  );
}

function ReportView({ report, outcomes }: { report: ImportReport; outcomes: BlueprintOutcome[] | null }) {
  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
      <ul className="flex flex-col gap-1" data-testid="moving-day">
        {report.tables.map((t) => (
          <MovingDayRow key={t.table} t={t} />
        ))}
      </ul>
      {outcomes && outcomes.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs" data-testid="blueprint-outcomes">
          {outcomes.map((o, i) => (
            <li key={i} className={o.ok ? undefined : "text-muted-foreground"}>
              {o.ok ? "🛋️" : "🚫"} blueprint “{o.name}”{" "}
              {o.ok ? "furnished its room" : `left behind — ${o.detail}`}
              {o.ok && o.detail ? ` (${o.detail})` : ""}
            </li>
          ))}
        </ul>
      )}
      {report.warnings.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary>⚠️ {report.warnings.length} field-level notes</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {report.not_imported.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="not-imported">
          Deliberately not coming along (rebuilt or retired in v2): {report.not_imported.join(", ")}.
        </p>
      )}
    </div>
  );
}

// ── The dialog ───────────────────────────────────────────────────────────────

type Phase = "idle" | "previewing" | "previewed" | "moving" | "done";

export function ImportV1Dialog({
  defaultDbPath,
  onClose,
}: {
  defaultDbPath: string | null;
  onClose: () => void;
}) {
  const [dbPath, setDbPath] = useState(defaultDbPath ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [outcomes, setOutcomes] = useState<BlueprintOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function preview() {
    setPhase("previewing");
    setError(null);
    setOutcomes(null);
    try {
      const res = await commands.previewV1Import(dbPath.trim() === "" ? null : dbPath.trim());
      if (res.status === "ok") {
        setReport(res.data);
        setPhase("previewed");
      } else {
        setError(res.error);
        setPhase("idle");
      }
    } catch (e) {
      setError(String(e));
      setPhase("idle");
    }
  }

  async function run() {
    setPhase("moving");
    setError(null);
    try {
      const res = await commands.runV1Import(dbPath.trim() === "" ? null : dbPath.trim(), {});
      if (res.status === "ok") {
        setReport(res.data);
        // frontend leg: blueprints → parse-v1 → world.props:<room_id>
        setOutcomes(await applyBlueprints(res.data));
        setPhase("done");
      } else {
        setError(res.error);
        setPhase("previewed");
      }
    } catch (e) {
      setError(String(e));
      setPhase("previewed");
    }
  }

  const willImportAnything = report?.tables.some((t) => t.will_import > 0) ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        data-testid="import-v1-dialog"
        role="dialog"
        aria-label="Import from CrewHub v1"
        className="flex max-h-full w-full max-w-lg flex-col gap-2 rounded-md border bg-card p-4 text-sm shadow-xl"
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">📦 Bring your crew over from v1</span>
          <button
            type="button"
            aria-label="Close"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>

        {phase === "idle" || phase === "previewing" ? (
          <>
            <p className="text-xs text-muted-foreground">
              Reads your v1 database <strong>without changing it</strong>, previews exactly what would move,
              and only writes after you confirm. Re-running later is safe — everything already imported is
              skipped.
            </p>
            <label className="text-xs text-muted-foreground" htmlFor="v1-db-path">
              v1 database
            </label>
            <input
              id="v1-db-path"
              data-testid="v1-db-path"
              value={dbPath}
              onChange={(e) => setDbPath(e.target.value)}
              placeholder="~/.crewhub/crewhub.db (leave empty for the default)"
              spellCheck={false}
              className="rounded border bg-background px-2 py-1 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
            />
          </>
        ) : report ? (
          <ReportView report={report} outcomes={outcomes} />
        ) : null}

        {phase === "moving" && (
          <p className="text-xs text-muted-foreground" data-testid="import-moving">
            🚚 Moving boxes…
          </p>
        )}
        {phase === "done" && (
          <p className="text-xs" data-testid="import-done">
            ✅ Done — your v1 file was left untouched. Rooms and props show up in the World panel.
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive" data-testid="import-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="outline" onClick={onClose}>
            {phase === "done" ? "Close" : "Cancel"}
          </Button>
          {(phase === "idle" || phase === "previewing") && (
            <Button
              size="xs"
              data-testid="import-preview"
              disabled={phase === "previewing"}
              onClick={() => void preview()}
            >
              {phase === "previewing" ? "Peeking…" : "👀 Preview (changes nothing)"}
            </Button>
          )}
          {phase === "previewed" && (
            <Button size="xs" data-testid="import-run" onClick={() => void run()}>
              {willImportAnything ? "🚚 Move them in" : "🚚 Run anyway"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
