#!/usr/bin/env bash
set -euo pipefail

mkdir -p apps/reference/src/modules/demo/lucky-number/application/events
mkdir -p apps/reference/src/modules/demo/lucky-number/application/event-handlers
mkdir -p apps/reference/src/modules/demo/lucky-number/application/commands
mkdir -p apps/reference/tests/unit/platform/events
mkdir -p apps/reference/tests/unit/modules/demo/lucky-number

cat > apps/reference/src/modules/demo/lucky-number/application/events/lucky-number-generated.event.ts <<'EOF'
import type { DomainEventEnvelope, IntegrationEventEnvelope } from '@/platform/events/contract';

export type LuckyNumberGenerated = DomainEventEnvelope<
  'demo.lucky-number.generated',
  Readonly<{ minimum: number; maximum: number; value: number }>
>;

export type LuckyNumberGeneratedV1 = IntegrationEventEnvelope<
  Readonly<{ minimum: number; maximum: number; value: number }>
>;

export type LuckyNumberGeneratedInput = Readonly<{
  id: string;
  occurredAt: string;
  correlationId: string;
  causationId: string;
  minimum: number;
  maximum: number;
  value: number;
}>;

export function createLuckyNumberGenerated(input: LuckyNumberGeneratedInput): LuckyNumberGenerated {
  return Object.freeze({
    id: input.id,
    type: 'demo.lucky-number.generated',
    occurredAt: input.occurredAt,
    aggregate: Object.freeze({ type: 'lucky-number-generation', id: input.id, version: 1 }),
    correlationId: input.correlationId,
    causationId: input.causationId,
    data: Object.freeze({ minimum: input.minimum, maximum: input.maximum, value: input.value }),
  });
}

export function toLuckyNumberGeneratedV1(event: LuckyNumberGenerated): LuckyNumberGeneratedV1 {
  return Object.freeze({
    specversion: '1.0',
    id: event.id,
    source: 'urn:winzard:reference:lucky-number',
    type: 'com.winzard.demo.lucky-number.generated.v1',
    subject: event.aggregate.id,
    time: event.occurredAt,
    datacontenttype: 'application/json',
    dataschema: 'urn:schema:winzard:lucky-number-generated:v1',
    correlationid: event.correlationId,
    causationid: event.causationId,
    data: event.data,
  });
}
EOF

cat > apps/reference/src/modules/demo/lucky-number/application/event-handlers/record-lucky-number-generated.ts <<'EOF'
import type { DomainEventHandler } from '@/platform/events/contract';
import type { LuckyNumberGenerated } from '../events/lucky-number-generated.event';

const received: LuckyNumberGenerated[] = [];

export const recordLuckyNumberGenerated = Object.freeze({
  id: 'demo.lucky-number.generated.record',
  eventType: 'demo.lucky-number.generated',
  phase: 'after-commit',
  failurePolicy: 'fail-fast',
  async handle(event, context): Promise<void> {
    if (context.signal.aborted) throw context.signal.reason;
    received.push(structuredClone(event));
  },
} satisfies DomainEventHandler<LuckyNumberGenerated>);

export function recordedLuckyNumberEvents(): readonly LuckyNumberGenerated[] {
  return Object.freeze(received.map((event) => structuredClone(event)));
}

export function clearRecordedLuckyNumberEvents(): void {
  received.length = 0;
}
EOF

cat > apps/reference/src/modules/demo/lucky-number/application/commands/dispatch-lucky-number-generated.ts <<'EOF'
import type { Clock, DomainEventDispatcher, EventIdGenerator } from '@/platform/events/contract';
import { createLuckyNumberGenerated, type LuckyNumberGenerated } from '../events/lucky-number-generated.event';

export type DispatchLuckyNumberGeneratedInput = Readonly<{
  minimum: number;
  maximum: number;
  value: number;
  correlationId: string;
  causationId: string;
}>;

export class DispatchLuckyNumberGenerated {
  constructor(
    private readonly dispatcher: DomainEventDispatcher,
    private readonly clock: Clock,
    private readonly ids: EventIdGenerator,
  ) {}

  async execute(
    input: DispatchLuckyNumberGeneratedInput,
    signal?: AbortSignal,
  ): Promise<LuckyNumberGenerated> {
    if (!Number.isInteger(input.minimum) || !Number.isInteger(input.maximum) || !Number.isInteger(input.value)) {
      throw new TypeError('Lucky number event values must be integers.');
    }
    if (input.minimum > input.maximum || input.value < input.minimum || input.value > input.maximum) {
      throw new RangeError('Lucky number event range is invalid.');
    }
    const event = createLuckyNumberGenerated({
      id: this.ids.next(),
      occurredAt: this.clock.now().toISOString(),
      correlationId: input.correlationId,
      causationId: input.causationId,
      minimum: input.minimum,
      maximum: input.maximum,
      value: input.value,
    });
    await this.dispatcher.dispatch([event], { signal });
    return event;
  }
}
EOF

cat > apps/reference/src/composition/application.event.definition.ts <<'EOF'
import { defineEvents } from '@/platform/events/contract';

export const applicationEvents = defineEvents({
  schemaVersion: 1,
  id: 'demo.lucky-number.events',
  events: [
    {
      id: 'demo.lucky-number.generated',
      type: 'demo.lucky-number.generated',
      category: 'domain',
      version: 1,
      source: 'src/modules/demo/lucky-number/application/events/lucky-number-generated.event.ts',
      export: 'LuckyNumberGenerated',
      producer: 'src/modules/demo/lucky-number/application/commands/dispatch-lucky-number-generated.ts',
      payloadSchema: 'urn:schema:winzard:lucky-number-generated:v1',
      classification: 'internal',
      tenantScoped: false,
      aliases: [],
      handlers: [
        {
          id: 'demo.lucky-number.generated.record',
          source: 'src/modules/demo/lucky-number/application/event-handlers/record-lucky-number-generated.ts',
          export: 'recordLuckyNumberGenerated',
          phase: 'after-commit',
          failurePolicy: 'fail-fast',
          before: [],
          after: [],
          idempotent: true,
          maximumAttempts: 1,
        },
      ],
    },
  ],
});
EOF

cat > apps/reference/src/composition/event-runtime.server.ts <<'EOF'
import 'server-only';
import { randomUUID } from 'node:crypto';

import { eventHandlerRegistry } from '@/generated/events/registry';
import { DispatchLuckyNumberGenerated } from '@/modules/demo/lucky-number/application/commands/dispatch-lucky-number-generated';
import { SequentialDomainEventDispatcher } from '@/platform/events/dispatcher';
import { RecordingEventDispatchTrace } from '@/platform/events/recording-trace';

export const eventTrace = new RecordingEventDispatchTrace();
export const eventDispatcher = new SequentialDomainEventDispatcher(eventHandlerRegistry, { trace: eventTrace });
export const dispatchLuckyNumberGenerated = new DispatchLuckyNumberGenerated(
  eventDispatcher,
  Object.freeze({ now: () => new Date() }),
  Object.freeze({ next: () => randomUUID() }),
);

export const eventRuntime = Object.freeze({ eventDispatcher, eventTrace, dispatchLuckyNumberGenerated });
EOF

cat > apps/reference/src/composition/events.composition.definition.ts <<'EOF'
import { defineComposition } from '@/platform/composition/contract';

export const eventComposition = defineComposition({
  schemaVersion: 1,
  id: 'demo.events',
  capability: 'event-dispatching',
  roots: [{
    id: 'demo.events.root',
    source: 'src/composition/event-runtime.server.ts',
    export: 'eventRuntime',
    runtime: 'nodejs',
    services: ['demo.events.dispatcher', 'demo.events.trace', 'demo.events.command.dispatch', 'demo.events.handler.record'],
  }],
  services: [
    {
      id: 'demo.events.handler.record',
      kind: 'application',
      implementation: 'recordLuckyNumberGenerated',
      source: 'src/modules/demo/lucky-number/application/event-handlers/record-lucky-number-generated.ts',
      export: 'recordLuckyNumberGenerated',
      lifetime: 'process',
      runtime: 'universal',
      visibility: 'private',
      dependencies: [],
      tags: ['event-handler'],
    },
    {
      id: 'demo.events.trace',
      kind: 'platform',
      implementation: 'RecordingEventDispatchTrace',
      source: 'src/platform/events/recording-trace.ts',
      export: 'RecordingEventDispatchTrace',
      lifetime: 'process',
      runtime: 'universal',
      visibility: 'private',
      dependencies: [],
    },
    {
      id: 'demo.events.dispatcher',
      kind: 'platform',
      implementation: 'SequentialDomainEventDispatcher',
      port: 'DomainEventDispatcher',
      source: 'src/platform/events/dispatcher.ts',
      export: 'SequentialDomainEventDispatcher',
      lifetime: 'process',
      runtime: 'universal',
      visibility: 'private',
      dependencies: ['demo.events.handler.record', 'demo.events.trace'],
    },
    {
      id: 'demo.events.command.dispatch',
      kind: 'application',
      implementation: 'DispatchLuckyNumberGenerated',
      source: 'src/modules/demo/lucky-number/application/commands/dispatch-lucky-number-generated.ts',
      export: 'DispatchLuckyNumberGenerated',
      lifetime: 'process',
      runtime: 'universal',
      visibility: 'public',
      dependencies: ['demo.events.dispatcher'],
    },
  ],
});
EOF

cat > apps/reference/tests/unit/platform/events/dispatcher.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import type { DomainEvent, DomainEventHandler, EventRegistry } from '@/platform/events/contract';
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
      'test.started': Object.freeze([Object.freeze({ id: 'start', eventType: 'test.started', async handle(_event, context) { calls.push('start'); context.record(event('test.finished', 'evt-2')); } })]),
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
EOF

cat > apps/reference/tests/unit/modules/demo/lucky-number/event-dispatch.test.ts <<'EOF'
import { beforeEach, describe, expect, it } from 'vitest';
import { eventHandlerRegistry } from '@/generated/events/registry';
import { DispatchLuckyNumberGenerated } from '@/modules/demo/lucky-number/application/commands/dispatch-lucky-number-generated';
import { clearRecordedLuckyNumberEvents, recordedLuckyNumberEvents } from '@/modules/demo/lucky-number/application/event-handlers/record-lucky-number-generated';
import { SequentialDomainEventDispatcher } from '@/platform/events/dispatcher';

beforeEach(clearRecordedLuckyNumberEvents);

describe('reference event vertical slice', () => {
  it('immutable eventet dispatch-el a generated registry handlerének', async () => {
    const command = new DispatchLuckyNumberGenerated(
      new SequentialDomainEventDispatcher(eventHandlerRegistry),
      Object.freeze({ now: () => new Date('2026-07-22T10:00:00.000Z') }),
      Object.freeze({ next: () => 'evt-lucky-1' }),
    );
    const result = await command.execute({ minimum: 1, maximum: 10, value: 7, correlationId: 'cor-1', causationId: 'cmd-1' });
    expect(result.type).toBe('demo.lucky-number.generated');
    expect(recordedLuckyNumberEvents()).toEqual([result]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.data)).toBe(true);
  });

  it('invalid tartománynál nem dispatch-el', async () => {
    const command = new DispatchLuckyNumberGenerated(
      new SequentialDomainEventDispatcher(eventHandlerRegistry),
      Object.freeze({ now: () => new Date() }),
      Object.freeze({ next: () => 'evt-invalid' }),
    );
    await expect(command.execute({ minimum: 5, maximum: 1, value: 3, correlationId: 'cor-1', causationId: 'cmd-1' })).rejects.toBeInstanceOf(RangeError);
    expect(recordedLuckyNumberEvents()).toEqual([]);
  });
});
EOF
