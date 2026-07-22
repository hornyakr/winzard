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
