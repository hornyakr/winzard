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
