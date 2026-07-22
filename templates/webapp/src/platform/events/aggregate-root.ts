import type { DomainEvent } from './contract';

export abstract class AggregateRoot {
  readonly #recordedEvents: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.#recordedEvents.push(event);
  }

  pullDomainEvents(): readonly DomainEvent[] {
    const events = Object.freeze([...this.#recordedEvents]);
    this.#recordedEvents.length = 0;
    return events;
  }
}
