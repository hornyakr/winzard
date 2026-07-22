import type { DomainEventEnvelope } from './contract';

export abstract class AggregateRoot {
  readonly #events: DomainEventEnvelope[] = [];
  protected record(event: DomainEventEnvelope): void { this.#events.push(Object.freeze(event)); }
  pullDomainEvents(): readonly DomainEventEnvelope[] { const events = Object.freeze([...this.#events]); this.#events.length = 0; return events; }
}
