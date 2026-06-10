import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { onDomainEvent } from "../ipc/events";

afterEach(clearMocks);

test("onDomainEvent subscribes via the generated event binding", async () => {
  const handler = vi.fn();
  mockIPC(() => {});
  const unlisten = await onDomainEvent(handler);
  expect(typeof unlisten).toBe("function");
});
