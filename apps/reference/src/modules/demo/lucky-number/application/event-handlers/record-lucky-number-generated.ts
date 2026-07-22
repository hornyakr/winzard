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
