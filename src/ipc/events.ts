import { events, type DomainEvent } from "./bindings";

/** Subscribe to the single typed domain-event stream from the Rust core. */
export function onDomainEvent(handler: (e: DomainEvent) => void) {
  return events.domainEvent.listen(({ payload }) => handler(payload));
}
