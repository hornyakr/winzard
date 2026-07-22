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
