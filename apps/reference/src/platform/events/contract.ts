export const EVENT_CATEGORIES = ['domain', 'application', 'integration', 'process-signal', 'telemetry', 'ui', 'lifecycle'] as const;
export const EVENT_PHASES = ['transactional', 'integration-map', 'after-commit', 'observe', 'cleanup'] as const;
export const EVENT_FAILURE_POLICIES = ['fail-fast', 'collect-and-fail', 'log-and-continue', 'retry-durable', 'dead-letter'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventPhase = (typeof EVENT_PHASES)[number];
export type EventFailurePolicy = (typeof EVENT_FAILURE_POLICIES)[number];

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
export type IntegrationEventEnvelope<TType extends string = string, TData = unknown> = Readonly<{
  specversion: '1.0'; id: string; source: string; type: TType; subject?: string; time: string;
  datacontenttype: 'application/json'; dataschema: string; correlationid: string; causationid: string;
  tenantid?: string; traceparent?: string; data: Readonly<TData>;
}>;
export type EventHandlerDefinition<E = unknown> = Readonly<{
  id: string; eventType: string; phase: EventPhase; failurePolicy: EventFailurePolicy;
  before?: readonly string[]; after?: readonly string[]; handle(event: E, context: EventHandlerContext): Promise<void>;
}>;
export type EventHandlerContext = Readonly<{ signal: AbortSignal; record(event: DomainEventEnvelope): void; trace?: EventDispatchTrace }>;
export type HandlerExecution = Readonly<{ eventId: string; eventType: string; handlerId: string; phase: EventPhase; startedAt: string; durationMs: number; outcome: 'success' | 'failure' | 'skipped'; errorCode?: string }>;
export interface EventDispatchTrace { record(execution: HandlerExecution): void | Promise<void>; }
export type EventRegistry = Readonly<Record<string, readonly EventHandlerDefinition[]>>;
export type EventDefinition = Readonly<{ schemaVersion: 1; id: string; events: readonly Readonly<Record<string, unknown>>[] }>;
export function defineEvents(definition: EventDefinition): EventDefinition { return definition; }
export interface Clock { now(): Date; }
export interface EventIdGenerator { next(): string; }
