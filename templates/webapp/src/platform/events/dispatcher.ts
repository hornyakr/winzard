import type {
  DispatchOptions,
  DomainEvent,
  DomainEventDispatcher,
  DomainEventHandler,
  EventDispatchTrace,
  EventRegistry,
} from './contract';

export class EventDispatchError extends Error {
  constructor(
    readonly eventId: string,
    readonly eventType: string,
    readonly handlerId: string,
    options: ErrorOptions,
  ) {
    super(`Event handler failed: ${handlerId} (${eventType}:${eventId}).`, options);
    this.name = 'EventDispatchError';
  }
}

export type SequentialDispatcherOptions = Readonly<{
  maximumEvents?: number;
  maximumDepth?: number;
  trace?: EventDispatchTrace;
}>;

export class SequentialDomainEventDispatcher implements DomainEventDispatcher {
  readonly #maximumEvents: number;
  readonly #maximumDepth: number;
  readonly #trace?: EventDispatchTrace;

  constructor(
    private readonly registry: EventRegistry,
    options: SequentialDispatcherOptions = {},
  ) {
    this.#maximumEvents = options.maximumEvents ?? 100;
    this.#maximumDepth = options.maximumDepth ?? 16;
    this.#trace = options.trace;
  }

  async dispatch(initialEvents: readonly DomainEvent[], options: DispatchOptions = {}): Promise<void> {
    const signal = options.signal ?? new AbortController().signal;
    const queue = initialEvents.map((event) => ({ event, depth: 0 }));
    let processed = 0;

    while (queue.length > 0) {
      if (signal.aborted) throw signal.reason ?? new DOMException('Event dispatch aborted.', 'AbortError');
      const current = queue.shift();
      if (!current) break;
      processed += 1;
      if (processed > this.#maximumEvents) throw new Error(`Event dispatch limit exceeded: ${this.#maximumEvents}.`);
      if (current.depth > this.#maximumDepth) throw new Error(`Nested event depth exceeded: ${this.#maximumDepth}.`);

      const handlers = this.registry[current.event.type] ?? [];
      for (const handler of handlers) {
        await this.#invoke(handler, current.event, signal, (event) => {
          queue.push({ event, depth: current.depth + 1 });
        });
      }
    }
  }

  async #invoke(
    handler: DomainEventHandler,
    event: DomainEvent,
    signal: AbortSignal,
    record: (event: DomainEvent) => void,
  ): Promise<void> {
    if (handler.failurePolicy === 'retry-durable' || handler.failurePolicy === 'dead-letter') {
      throw new Error(`Durable handler cannot run on the local dispatcher: ${handler.id}.`);
    }
    const startedAt = new Date();
    const started = performance.now();
    try {
      await handler.handle(event, Object.freeze({ signal, record }));
      await this.#trace?.record(Object.freeze({
        eventId: event.id,
        eventType: event.type,
        handlerId: handler.id,
        startedAt: startedAt.toISOString(),
        durationMs: Math.max(0, performance.now() - started),
        outcome: 'success',
      }));
    } catch (cause) {
      await this.#trace?.record(Object.freeze({
        eventId: event.id,
        eventType: event.type,
        handlerId: handler.id,
        startedAt: startedAt.toISOString(),
        durationMs: Math.max(0, performance.now() - started),
        outcome: 'failure',
        errorCode: cause instanceof Error ? cause.name : 'UNKNOWN',
      }));
      if (handler.failurePolicy !== 'log-and-continue') {
        throw new EventDispatchError(event.id, event.type, handler.id, { cause });
      }
    }
  }
}
