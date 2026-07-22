import type { DomainEventEnvelope, IntegrationEventEnvelope } from '@/platform/events/contract';
export type LuckyNumberGenerated = DomainEventEnvelope<'demo.lucky-number.generated', Readonly<{ value: number; minimum: number; maximum: number }>>;
export type LuckyNumberGeneratedV1 = IntegrationEventEnvelope<'com.winzard.demo.lucky-number.generated.v1', Readonly<{ value: number; minimum: number; maximum: number }>>;
