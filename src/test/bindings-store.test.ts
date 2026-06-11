import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { useBindingsStore } from "@/stores/bindings";
import { binding, room } from "./fixtures";

afterEach(() => {
  clearMocks();
  useBindingsStore.getState().reset();
});

const stored = binding({ session_id: "s-1", display_name: "Old name", updated_at: 42 });

test("init seeds bindings and rooms", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_session_bindings") return [stored];
    if (cmd === "list_rooms") return [room({ id: "rm-1", name: "Lab" })];
    return null;
  });
  await useBindingsStore.getState().init();
  const s = useBindingsStore.getState();
  expect(s.loaded).toBe(true);
  expect(s.bindings["s-1"]?.display_name).toBe("Old name");
  expect(s.rooms.map((r) => r.name)).toEqual(["Lab"]);
});

test("upsert is optimistic and settles on the backend row", async () => {
  let resolveBackend: (() => void) | undefined;
  const gate = new Promise<void>((r) => (resolveBackend = r));
  mockIPC(async (cmd, args) => {
    if (cmd === "upsert_session_binding") {
      await gate;
      const input = (args as { input: { session_id: string; display_name: string | null } }).input;
      return {
        ...binding({ session_id: input.session_id }),
        display_name: input.display_name,
        updated_at: 99,
      };
    }
    return null;
  });
  const done = useBindingsStore
    .getState()
    .upsert({ session_id: "s-1", agent_id: null, room_id: null, display_name: "New name", pinned: true });
  // optimistic state is visible before the backend answers
  expect(useBindingsStore.getState().bindings["s-1"]?.display_name).toBe("New name");
  resolveBackend?.();
  expect(await done).toBeNull();
  expect(useBindingsStore.getState().bindings["s-1"]?.updated_at).toBe(99);
});

test("upsert rolls back to the previous binding on IPC error (EKI-40 AC)", async () => {
  mockIPC((cmd) => {
    if (cmd === "list_session_bindings") return [stored];
    if (cmd === "list_rooms") return [];
    if (cmd === "upsert_session_binding") throw "db locked";
    return null;
  });
  await useBindingsStore.getState().init();
  const err = await useBindingsStore
    .getState()
    .upsert({ session_id: "s-1", agent_id: null, room_id: null, display_name: "Doomed", pinned: false });
  expect(err).toContain("db locked");
  expect(useBindingsStore.getState().bindings["s-1"]).toEqual(stored);
});

test("remove rolls back on IPC error, removes optimistically on success", async () => {
  let fail = true;
  mockIPC((cmd) => {
    if (cmd === "list_session_bindings") return [stored];
    if (cmd === "list_rooms") return [];
    if (cmd === "delete_session_binding") {
      if (fail) throw "nope";
      return true;
    }
    return null;
  });
  await useBindingsStore.getState().init();

  expect(await useBindingsStore.getState().remove("s-1")).toContain("nope");
  expect(useBindingsStore.getState().bindings["s-1"]).toEqual(stored);

  fail = false;
  expect(await useBindingsStore.getState().remove("s-1")).toBeNull();
  expect(useBindingsStore.getState().bindings["s-1"]).toBeUndefined();
});
