import { Component, type ReactNode } from "react";

/** A failed lazy scene import must not take the accessible oversight UI with it. */
export class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * One overlay over the scene (the agent card, the label layer): a render error in it shows `fallback` in its place and
 * leaves the town up; only the canvas's own failure is a graphics failure (round 48: a card that threw took the whole
 * town away). It tries again when `resetKey` changes (another agent's card, another building).
 */
export class OverlayBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: unknown; name: string },
  { failed: boolean; key: unknown }
> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(
    props: { resetKey: unknown },
    state: { key: unknown },
  ) {
    return props.resetKey === state.key
      ? null
      : { failed: false, key: props.resetKey };
  }
  componentDidCatch(error: unknown) {
    console.warn(
      `CrewHub World: the ${this.props.name} could not be drawn; the town stays.`,
      error,
    );
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
