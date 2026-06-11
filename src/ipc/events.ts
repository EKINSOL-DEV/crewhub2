import { events, type DomainEvent, type SessionEvent } from "./bindings";

/** Subscribe to the single typed domain-event stream from the Rust core. */
export function onDomainEvent(handler: (e: DomainEvent) => void) {
  return events.domainEvent.listen(({ payload }) => handler(payload));
}

/** Subscribe to the provider-neutral engine event fan-in (all sessions, all providers). */
export function onEngineEvent(handler: (e: SessionEvent) => void) {
  return events.engineEvent.listen(({ payload }) => handler(payload));
}
