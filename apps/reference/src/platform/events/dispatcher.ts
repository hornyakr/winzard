import type { DomainEventEnvelope, EventHandlerContext, EventHandlerDefinition, EventRegistry, HandlerExecution } from './contract';

export type DispatchLimits = Readonly<{ maximumEvents: number; maximumDepth: number }>;
export class EventDispatchError extends Error { constructor(readonly failures: readonly Error[]) { super(`Event dispatch failed in ${failures.length} handler(s).`); this.name = 'EventDispatchError'; } }
export class SequentialDomainEventDispatcher {
  constructor(private readonly registry: EventRegistry, private readonly limits: DispatchLimits = { maximumEvents: 256, maximumDepth: 32 }) {}
  async dispatch(initial: readonly DomainEventEnvelope[], input: Omit<EventHandlerContext, 'record'>): Promise<void> {
    const queue = initial.map((event) => ({ event, depth: 0 })); let processed = 0;
    while (queue.length > 0) {
      const current = queue.shift(); if (!current) break;
      if (++processed > this.limits.maximumEvents) throw new Error('EVENT_DISPATCH_EVENT_LIMIT');
      if (current.depth > this.limits.maximumDepth) throw new Error('EVENT_DISPATCH_DEPTH_LIMIT');
      const handlers = this.registry[current.event.type] ?? []; const collected: Error[] = [];
      for (const handler of handlers) {
        if (input.signal.aborted) throw input.signal.reason ?? new Error('EVENT_DISPATCH_ABORTED');
        const started = Date.now(); const startedAt = new Date(started).toISOString(); const nested: DomainEventEnvelope[] = [];
        try { await handler.handle(current.event, { ...input, record: (event) => nested.push(Object.freeze(event)) }); await input.trace?.record(execution(current.event, handler, startedAt, started, 'success')); }
        catch (error) { const failure = error instanceof Error ? error : new Error(String(error)); await input.trace?.record(execution(current.event, handler, startedAt, started, 'failure', failure.name)); if (handler.failurePolicy === 'log-and-continue') continue; if (handler.failurePolicy === 'collect-and-fail') { collected.push(failure); continue; } throw failure; }
        queue.push(...nested.map((event) => ({ event, depth: current.depth + 1 })));
      }
      if (collected.length > 0) throw new EventDispatchError(Object.freeze(collected));
    }
  }
}
function execution(event: DomainEventEnvelope, handler: EventHandlerDefinition, startedAt: string, started: number, outcome: HandlerExecution['outcome'], errorCode?: string): HandlerExecution { return Object.freeze({ eventId: event.id, eventType: event.type, handlerId: handler.id, phase: handler.phase, startedAt, durationMs: Math.max(0, Date.now() - started), outcome, ...(errorCode ? { errorCode } : {}) }); }
