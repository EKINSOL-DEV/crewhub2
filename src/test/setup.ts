import "@testing-library/jest-dom/vitest";

// jsdom polyfills for cmdk (scrollIntoView) and motion/radix (ResizeObserver)
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no real pointer capture (used by draggable headers, e.g.
// game/chat/use-drag-position.ts, and by several Radix components).
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

// @tauri-apps/api's event.unlisten() calls
// window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener. mockIPC()
// installs it, but clearMocks() DELETES it in afterEach — any component
// unmount cleanup whose async unlisten lands after clearMocks throws an
// unhandled TypeError that fails CI. A Proxy keeps mockIPC's real functions
// when present and falls back to a no-op once they're cleared.
// Both globals get the same treatment (mockIPC assigns onto the existing
// object, so the Proxies survive). Fallback functions return undefined —
// awaited fire-and-forget cleanups tolerate that fine.
for (const key of ["__TAURI_EVENT_PLUGIN_INTERNALS__", "__TAURI_INTERNALS__"]) {
  const target: Record<PropertyKey, unknown> = {};
  (window as unknown as Record<string, unknown>)[key] = new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => {}),
  });
}
