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
