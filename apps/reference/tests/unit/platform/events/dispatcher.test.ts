import { describe, expect, it } from 'vitest';
import type { DomainEvent, DomainEventHandler, DomainEventHandlerContext, EventRegistry } from '@/platform/events/contract';
import { EventDispatchError, SequentialDomainEventDispatcher } from '@/platform/events/dispatcher';
import { RecordingEventDispatchTrace } from '@/platform/events/recording-trace';

function event(type = 'test.started', id = 'evt-1'): DomainEvent {
  return Object.freeze({ id, type, occurredAt: '2026-07-22T10:00:00.000Z', aggregate: Object.freeze({ type: 'test', id: '1', version: 1 }), correlationId: 'cor-1', causationId: 'cmd-1', data: Object.freeze({}) });
}

describe('SequentialDomainEventDispatcher', () => {
  it('deterministic orderben futtatja a handlereket és trace-t készít', async () => {
    const calls: string[] = [];
    const handler = (id: string): DomainEventHandler => Object.freeze({ id, eventType: 'test.started', failurePolicy: 'fail-fast', async handle() { calls.push(id); } });
    const registry = Object.freeze({ 'test.started': Object.freeze([handler('a'), handler('b')]) }) satisfies EventRegistry;
    const trace = new RecordingEventDispatchTrace();
    await new SequentialDomainEventDispatcher(registry, { trace }).dispatch([event()]);
    expect(calls).toEqual(['a', 'b']);
    expect(trace.snapshot()).toHaveLength(2);
  });

  it('nested eventet queue-n keresztül dolgoz fel', async () => {
    const calls: string[] = [];
    const registry = Object.freeze({
      'test.started': Object.freeze([Object.freeze({ id: 'start', eventType: 'test.started', async handle(_event: DomainEvent, context: DomainEventHandlerContext) { calls.push('start'); context.record(event('test.finished', 'evt-2')); } })]),
      'test.finished': Object.freeze([Object.freeze({ id: 'finish', eventType: 'test.finished', async handle() { calls.push('finish'); } })]),
    }) satisfies EventRegistry;
    await new SequentialDomainEventDispatcher(registry).dispatch([event()]);
    expect(calls).toEqual(['start', 'finish']);
  });

  it('fail-fast hibát EventDispatchError formában propagál', async () => {
    const registry = Object.freeze({ 'test.started': Object.freeze([Object.freeze({ id: 'broken', eventType: 'test.started', failurePolicy: 'fail-fast', async handle() { throw new Error('broken'); } })]) }) satisfies EventRegistry;
    await expect(new SequentialDomainEventDispatcher(registry).dispatch([event()])).rejects.toBeInstanceOf(EventDispatchError);
  });
});
