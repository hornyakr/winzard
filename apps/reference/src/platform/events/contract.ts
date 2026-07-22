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
