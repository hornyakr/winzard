#!/usr/bin/env bash
set -euo pipefail

write_runtime() {
  local root="$1"
  mkdir -p "$root/src/platform/events"

  cat > "$root/src/platform/events/contract.ts" <<'EOF'
export const EVENT_CATEGORIES = ['domain', 'application', 'integration', 'process-signal', 'telemetry'] as const;
export const EVENT_PHASES = ['transactional', 'integration-map', 'after-commit', 'telemetry'] as const;
export const EVENT_FAILURE_POLICIES = ['fail-fast', 'collect-and-fail', 'log-and-continue', 'retry-durable', 'dead-letter'] as const;
export const EVENT_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventPhase = (typeof EVENT_PHASES)[number];
export type EventFailurePolicy = (typeof EVENT_FAILURE_POLICIES)[number];
export type EventClassification = (typeof EVENT_CLASSIFICATIONS)[number];

export type DomainEventEnvelope<TType extends string = string, TData = unknown> = Readonly<{
  id: string;
  type: TType;
  occurredAt: string;
  aggregate: Readonly<{ type: string; id: string; version: number }>;
  correlationId: string;
  causationId: string;
  tenantId?: string;
  data: Readonly<TData>;
}>;

export type IntegrationEventEnvelope<TData = unknown> = Readonly<{
  specversion: '1.0';
  id: string;
  source: string;
  type: string;
  subject?: string;
  time: string;
  datacontenttype: 'application/json';
  dataschema?: string;
  correlationid: string;
  causationid: string;
  tenantid?: string;
  traceparent?: string;
  data: Readonly<TData>;
}>;

export type DomainEvent = DomainEventEnvelope<string, unknown>;

export type HandlerExecution = Readonly<{
  eventId: string;
  eventType: string;
  handlerId: string;
  startedAt: string;
  durationMs: number;
  outcome: 'success' | 'failure' | 'skipped';
  errorCode?: string;
}>;

export interface EventDispatchTrace {
  record(execution: HandlerExecution): void | Promise<void>;
}

export type DomainEventHandlerContext = Readonly<{
  signal: AbortSignal;
  record(event: DomainEvent): void;
}>;

export interface DomainEventHandler<E extends DomainEvent = DomainEvent> {
  readonly id: string;
  readonly eventType: E['type'];
  readonly phase?: EventPhase;
  readonly failurePolicy?: EventFailurePolicy;
  handle(event: E, context: DomainEventHandlerContext): void | Promise<void>;
}

export type EventRegistry = Readonly<Record<string, readonly DomainEventHandler[]>>;

export type DispatchOptions = Readonly<{ signal?: AbortSignal }>;

export interface DomainEventDispatcher {
  dispatch(events: readonly DomainEvent[], options?: DispatchOptions): Promise<void>;
}

export interface Clock { now(): Date }
export interface EventIdGenerator { next(): string }

export type EventDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  events: readonly Readonly<Record<string, unknown>>[];
}>;

export function defineEvents<T extends EventDefinition>(definition: T): T {
  return definition;
}
EOF

  cat > "$root/src/platform/events/dispatcher.ts" <<'EOF'
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
EOF

  cat > "$root/src/platform/events/aggregate-root.ts" <<'EOF'
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
EOF

  cat > "$root/src/platform/events/recording-trace.ts" <<'EOF'
import type { EventDispatchTrace, HandlerExecution } from './contract';

export class RecordingEventDispatchTrace implements EventDispatchTrace {
  readonly #executions: HandlerExecution[] = [];

  record(execution: HandlerExecution): void {
    this.#executions.push(Object.freeze({ ...execution }));
  }

  snapshot(): readonly HandlerExecution[] {
    return Object.freeze(this.#executions.map((execution) => Object.freeze({ ...execution })));
  }

  clear(): void {
    this.#executions.length = 0;
  }
}
EOF
}

write_runtime apps/reference
write_runtime templates/minimal
write_runtime templates/webapp

mkdir -p recipes/event-dispatching/files/src/platform/events
cp apps/reference/src/platform/events/contract.ts recipes/event-dispatching/files/src/platform/events/contract.ts
cp apps/reference/src/platform/events/dispatcher.ts recipes/event-dispatching/files/src/platform/events/dispatcher.ts
cp apps/reference/src/platform/events/aggregate-root.ts recipes/event-dispatching/files/src/platform/events/aggregate-root.ts
cp apps/reference/src/platform/events/recording-trace.ts recipes/event-dispatching/files/src/platform/events/recording-trace.ts
