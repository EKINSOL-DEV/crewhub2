// Import-from-v1 UI (M6 T10, EKI-106): Moving Day preview table with
// per-table counts + plain-words skip reasons, the run leg, the client-side
// blueprint conversion (§3.2 round-trip frontend half: parse-v1 →
// serializeRoomProps → world.props:<room_id> KV), honest second-run
// all-skipped rendering, and the not-imported list.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { ImportReport } from "@/ipc/bindings";
import { applyBlueprints, ImportV1Dialog } from "@/onboarding/ImportDialog";
import { parseStoredRoomProps } from "@/panels/world/props/placement";

afterEach(() => {
  cleanup();
  clearMocks();
});

const V1_BLUEPRINT = JSON.stringify({
  name: "Cozy office",
  gridWidth: 4,
  gridDepth: 4,
  cellSize: 0.6,
  placements: [
    { propId: "desk-with-monitor", x: 0, z: 0 },
    { propId: "some-unknown-prop", x: 2, z: 2 },
  ],
});

function report(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    db_path: "/home/u/.crewhub/crewhub.db",
    dry_run: true,
    tables: [
      {
        table: "projects",
        found: 3,
        will_import: 2,
        skipped: [{ reason: "needs_folder (no folder_path; assign one in folder_overrides)", count: 1 }],
      },
      { table: "tasks", found: 14, will_import: 14, skipped: [] },
    ],
    warnings: ["room r-9: linked project not imported — kept as a global room"],
    not_imported: ["meetings", "standups", "placed_props"],
    blueprints: [],
    imported: { projects: [], rooms: [], agents: [], tasks: [], bindings: [], templates: [] },
    ...overrides,
  };
}

test("preview renders Moving Day rows: counts moved in, skips in plain words", async () => {
  const previews: Array<string | null> = [];
  mockIPC((cmd, args) => {
    if (cmd === "preview_v1_import") {
      previews.push((args as { dbPath: string | null }).dbPath);
      return report();
    }
    return null;
  });
  render(<ImportV1Dialog defaultDbPath="/v1/crewhub.db" onClose={() => {}} />);
  fireEvent.click(screen.getByTestId("import-preview"));
  await screen.findByTestId("moving-day");
  expect(previews).toEqual(["/v1/crewhub.db"]);
  expect(screen.getByTestId("import-projects")).toHaveTextContent("📦 2 of 3 projects moving in");
  expect(screen.getByTestId("import-projects")).toHaveTextContent("🚫 1 left behind — needs_folder");
  expect(screen.getByTestId("import-tasks")).toHaveTextContent("📦 14 of 14 tasks moving in");
  expect(screen.getByTestId("not-imported")).toHaveTextContent("meetings, standups, placed_props");
});

test("empty path previews the default v1 location (null over the wire)", async () => {
  const previews: Array<string | null> = [];
  mockIPC((cmd, args) => {
    if (cmd === "preview_v1_import") {
      previews.push((args as { dbPath: string | null }).dbPath);
      return report();
    }
    return null;
  });
  render(<ImportV1Dialog defaultDbPath={null} onClose={() => {}} />);
  fireEvent.click(screen.getByTestId("import-preview"));
  await screen.findByTestId("moving-day");
  expect(previews).toEqual([null]);
});

test("run executes the same plan and converts blueprints into world.props KV writes", async () => {
  const settingWrites: Array<[string, string]> = [];
  mockIPC((cmd, args) => {
    if (cmd === "preview_v1_import") return report();
    if (cmd === "run_v1_import")
      return report({
        dry_run: false,
        blueprints: [
          { id: "bp1", name: "Cozy office", room_id: "room-7", blueprint_json: V1_BLUEPRINT },
          { id: "bp2", name: "Orphan", room_id: null, blueprint_json: V1_BLUEPRINT },
        ],
      });
    if (cmd === "set_setting") {
      const { key, value } = args as { key: string; value: string };
      settingWrites.push([key, value]);
      return null;
    }
    return null;
  });
  render(<ImportV1Dialog defaultDbPath="/v1/db" onClose={() => {}} />);
  fireEvent.click(screen.getByTestId("import-preview"));
  fireEvent.click(await screen.findByTestId("import-run"));
  await screen.findByTestId("import-done");

  // the KV write is the M5 shape, keyed by the PRESERVED v1 room id
  expect(settingWrites).toHaveLength(1);
  const [key, value] = settingWrites[0]!;
  expect(key).toBe("world.props:room-7");
  const parsed = parseStoredRoomProps(value);
  expect(parsed).not.toBeNull();
  expect(parsed!.length).toBe(2); // both placements survive (unknown → 📦 crate)

  // per-blueprint success/failure in the report
  const outcomes = screen.getByTestId("blueprint-outcomes");
  expect(outcomes).toHaveTextContent("blueprint “Cozy office” furnished its room");
  expect(outcomes).toHaveTextContent("blueprint “Orphan” left behind — no room to land in");
});

test("second run shows all-skipped honestly", async () => {
  mockIPC((cmd) => {
    if (cmd === "preview_v1_import")
      return report({
        tables: [
          {
            table: "projects",
            found: 3,
            will_import: 0,
            skipped: [{ reason: "already imported", count: 3 }],
          },
        ],
      });
    return null;
  });
  render(<ImportV1Dialog defaultDbPath="/v1/db" onClose={() => {}} />);
  fireEvent.click(screen.getByTestId("import-preview"));
  await screen.findByTestId("moving-day");
  expect(screen.getByTestId("import-projects")).toHaveTextContent("📦 0 of 3 projects moving in");
  expect(screen.getByTestId("import-projects")).toHaveTextContent("🚫 3 left behind — already imported");
  expect(screen.getByTestId("import-run")).toHaveTextContent("Run anyway");
});

test("a preview failure surfaces inline and keeps the dialog usable", async () => {
  mockIPC((cmd) => {
    if (cmd === "preview_v1_import") throw "v1 database not found at /nope";
    return null;
  });
  render(<ImportV1Dialog defaultDbPath="/nope" onClose={() => {}} />);
  fireEvent.click(screen.getByTestId("import-preview"));
  expect(await screen.findByTestId("import-error")).toHaveTextContent("not found");
  expect(screen.getByTestId("import-preview")).toBeEnabled(); // retryable
});

// ── applyBlueprints (pure-ish, injected writer) ──────────────────────────────

test("applyBlueprints: parse failures and missing rooms are per-row outcomes, not throws", async () => {
  const writes: string[] = [];
  const outcomes = await applyBlueprints(
    report({
      blueprints: [
        { id: "a", name: "Good", room_id: "r1", blueprint_json: V1_BLUEPRINT },
        { id: "b", name: "Bad JSON", room_id: "r2", blueprint_json: "{nope" },
        { id: "c", name: "Roomless", room_id: null, blueprint_json: V1_BLUEPRINT },
      ],
    }),
    (key) => {
      writes.push(key);
      return Promise.resolve();
    },
  );
  expect(writes).toEqual(["world.props:r1"]);
  expect(outcomes.map((o) => o.ok)).toEqual([true, false, false]);
  expect(outcomes[0]!.detail).toMatch(/Unknown prop/); // parse warnings carried through
  expect(outcomes[1]!.detail).toMatch(/JSON/);
  expect(outcomes[2]!.detail).toBe("no room to land in");
});
