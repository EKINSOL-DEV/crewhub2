// Assignment-rule editor for one room (M3 T8, EKI-87): priority-ordered list,
// add/edit rows with per-type hints (the documented glob dialect included),
// and a live "test a session" preview that runs the SAME evaluator semantics
// as the Rust hook (room-rules.ts mirror) across ALL rules — so cross-room
// precedence is honest, not room-local.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Room } from "@/ipc/bindings";
import { useRoomsStore } from "@/stores/rooms";
import {
  assignRoom,
  ruleLabel,
  RULE_TYPE_HINTS,
  ROOM_RULE_TYPES,
  type RoomRuleType,
  type RuleProbe,
} from "./room-rules";

interface Draft {
  /** undefined = a new rule not yet saved. */
  id?: string;
  rule_type: RoomRuleType;
  rule_value: string;
  priority: number;
}

function RuleRow({
  draft,
  onChange,
  onSave,
  onDelete,
  busy,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: () => void;
  onDelete: (() => void) | null;
  busy: boolean;
}) {
  const hints = RULE_TYPE_HINTS[draft.rule_type];
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <select
          aria-label="Rule type"
          className="rounded border bg-card px-1 py-0.5 text-xs"
          value={draft.rule_type}
          onChange={(e) => onChange({ ...draft, rule_type: e.target.value as RoomRuleType })}
        >
          {ROOM_RULE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          aria-label="Rule value"
          className="flex-1 rounded border bg-card px-1 py-0.5 font-mono text-xs"
          placeholder={hints.placeholder}
          value={draft.rule_value}
          onChange={(e) => onChange({ ...draft, rule_value: e.target.value })}
        />
        <input
          aria-label="Rule priority"
          type="number"
          className="w-14 rounded border bg-card px-1 py-0.5 text-xs"
          title="Higher priority wins; ties go to the newest rule"
          value={draft.priority}
          onChange={(e) => onChange({ ...draft, priority: Number(e.target.value) || 0 })}
        />
        <Button size="xs" variant="outline" disabled={!draft.rule_value.trim() || busy} onClick={onSave}>
          {draft.id ? "Save" : "Add"}
        </Button>
        {onDelete && (
          <Button size="xs" variant="ghost" onClick={onDelete}>
            ✕
          </Button>
        )}
      </div>
      <p className="pl-1 text-[10px] text-muted-foreground">{hints.hint}</p>
    </div>
  );
}

export function RuleEditor({ room }: { room: Room }) {
  const allRules = useRoomsStore((s) => s.rules);
  const rooms = useRoomsStore((s) => s.rooms);
  const { createRule, updateRule, removeRule } = useRoomsStore();
  const roomRules = allRules.filter((r) => r.room_id === room.id);
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Test a session" probe (EKI-87 live preview).
  const [probePath, setProbePath] = useState("");
  const [probeModel, setProbeModel] = useState("");
  const [probeOrigin, setProbeOrigin] = useState<"managed" | "external">("external");
  const [probeSummary, setProbeSummary] = useState("");

  const probe: RuleProbe = {
    project_path: probePath,
    model: probeModel || null,
    origin: probeOrigin,
    summary: probeSummary || null,
  };
  const probeTouched = probePath !== "" || probeModel !== "" || probeSummary !== "";
  const winner = probeTouched ? assignRoom(allRules, probe) : null;
  const winnerRoom = winner ? (rooms.find((r) => r.id === winner.room_id) ?? null) : null;

  const run = async (p: Promise<{ status: "ok" } | { status: "error"; error: string }>) => {
    setBusy(true);
    setError(null);
    const res = await p;
    setBusy(false);
    if (res.status === "error") {
      setError(res.error);
      return false;
    }
    return true;
  };

  const del = async (id: string) => {
    setBusy(true);
    setError(null);
    const err = await removeRule(id);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div data-testid={`rule-editor-${room.id}`} className="flex flex-col gap-1.5 rounded border p-2">
      <div className="flex items-center gap-2">
        <h5 className="flex-1 text-xs font-medium">Assignment rules · {room.name}</h5>
        {adding === null && (
          <Button
            size="xs"
            variant="outline"
            onClick={() => setAdding({ rule_type: "keyword", rule_value: "", priority: 0 })}
          >
            Add rule
          </Button>
        )}
      </div>

      {roomRules.length === 0 && adding === null && (
        <p className="text-xs text-muted-foreground">
          No rules — sessions only land here when you bind them by hand.
        </p>
      )}

      {roomRules.map((rule) => {
        const draft = edits[rule.id] ?? {
          id: rule.id,
          rule_type: rule.rule_type as RoomRuleType,
          rule_value: rule.rule_value,
          priority: rule.priority,
        };
        return (
          <RuleRow
            key={rule.id}
            draft={draft}
            busy={busy}
            onChange={(d) => setEdits((e) => ({ ...e, [rule.id]: d }))}
            onSave={() =>
              void run(
                updateRule({
                  id: rule.id,
                  room_id: rule.room_id,
                  rule_type: draft.rule_type,
                  rule_value: draft.rule_value.trim(),
                  priority: draft.priority,
                }),
              ).then((ok) => {
                if (ok)
                  setEdits((e) => {
                    const next = { ...e };
                    delete next[rule.id];
                    return next;
                  });
              })
            }
            onDelete={() => void del(rule.id)}
          />
        );
      })}

      {adding !== null && (
        <RuleRow
          draft={adding}
          busy={busy}
          onChange={setAdding}
          onSave={() =>
            void run(
              createRule({
                room_id: room.id,
                rule_type: adding.rule_type,
                rule_value: adding.rule_value.trim(),
                priority: adding.priority,
              }),
            ).then((ok) => ok && setAdding(null))
          }
          onDelete={() => setAdding(null)}
        />
      )}

      {error && (
        <p data-testid="rule-error" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <div data-testid="rule-preview" className="mt-1 flex flex-col gap-1 rounded bg-muted/40 p-1.5">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Test a session
        </p>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <input
            aria-label="Test project path"
            className="min-w-40 flex-1 rounded border bg-card px-1 py-0.5 font-mono"
            placeholder="/Users/you/code/project"
            value={probePath}
            onChange={(e) => setProbePath(e.target.value)}
          />
          <input
            aria-label="Test model"
            className="w-24 rounded border bg-card px-1 py-0.5 font-mono"
            placeholder="model"
            value={probeModel}
            onChange={(e) => setProbeModel(e.target.value)}
          />
          <select
            aria-label="Test origin"
            className="rounded border bg-card px-1 py-0.5"
            value={probeOrigin}
            onChange={(e) => setProbeOrigin(e.target.value as "managed" | "external")}
          >
            <option value="external">external</option>
            <option value="managed">managed</option>
          </select>
          <input
            aria-label="Test summary"
            className="min-w-32 flex-1 rounded border bg-card px-1 py-0.5"
            placeholder="session summary…"
            value={probeSummary}
            onChange={(e) => setProbeSummary(e.target.value)}
          />
        </div>
        {probeTouched && (
          <p data-testid="rule-preview-result" className="text-xs">
            {winner && winnerRoom ? (
              <>
                → lands in <strong>{winnerRoom.name}</strong>{" "}
                <span className="text-muted-foreground">via {ruleLabel(winner)}</span>
                {winner.room_id !== room.id && (
                  <span className="text-muted-foreground"> (a different room outranks this one)</span>
                )}
              </>
            ) : (
              "→ no rule matches 🤷 — it would stay unassigned"
            )}
          </p>
        )}
      </div>
    </div>
  );
}
