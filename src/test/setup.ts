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
