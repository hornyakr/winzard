import type { EventHandlerDefinition } from '@/platform/events/contract';
import type { LuckyNumberGenerated } from '../events/lucky-number-generated.event';
export const recordedLuckyNumberEvents: LuckyNumberGenerated[] = [];
export const recordLuckyNumberGenerated: EventHandlerDefinition<LuckyNumberGenerated> = Object.freeze({
  id: 'demo.lucky-number.generated.record-trace', eventType: 'demo.lucky-number.generated', phase: 'observe', failurePolicy: 'log-and-continue',
  async handle(event): Promise<void> { recordedLuckyNumberEvents.push(Object.freeze({ ...event, data: Object.freeze({ ...event.data }), aggregate: Object.freeze({ ...event.aggregate }) })); },
});
