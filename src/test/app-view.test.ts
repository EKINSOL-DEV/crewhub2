// Top-level view store (world-primary shell): the world is PRIMARY at start.
import { resetAppViewForTests, useAppView } from "../stores/appView";

afterEach(resetAppViewForTests);

describe("appView store", () => {
  test("boots into the world — the product decision, not a preference", () => {
    expect(useAppView.getState().view).toBe("world");
  });

  test("setView switches to the workspace and back", () => {
    useAppView.getState().setView("workspace");
    expect(useAppView.getState().view).toBe("workspace");
    useAppView.getState().setView("world");
    expect(useAppView.getState().view).toBe("world");
  });

  test("the view is NOT persisted — no storage writes on switch", () => {
    // The store has no persistence wiring at all; this guards against someone
    // "helpfully" adding it later. Boot default must survive a reset.
    useAppView.getState().setView("workspace");
    resetAppViewForTests();
    expect(useAppView.getState().view).toBe("world");
  });
});
