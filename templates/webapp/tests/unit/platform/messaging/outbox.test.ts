import { describe, expect, it } from 'vitest';
import { OutboxRelay, retryDelayMs, type IntegrationPublisher, type OutboxMessage, type OutboxRepository } from '@/platform/messaging/outbox';

const message: OutboxMessage = Object.freeze({ id: 'evt-1', source: 'urn:test', type: 'test.created.v1', subject: '1', occurredAt: new Date('2026-07-22T10:00:00.000Z'), aggregateId: '1', aggregateSequence: 1n, payload: Object.freeze({ id: '1' }), metadata: Object.freeze({ correlationId: 'cor-1' }), attempts: 0 });

describe('transactional outbox core', () => {
  it('deterministic jitter nélküli exponenciális backoffot számol', () => {
    expect(retryDelayMs({ maximumAttempts: 5, initialDelayMs: 100, maximumDelayMs: 1000, multiplier: 2, jitterRatio: 0 }, 3)).toBe(800);
  });

  it('sikeres publish után published állapotot kér', async () => {
    const calls: string[] = [];
    const repository: OutboxRepository = { async claimBatch() { return [message]; }, async markPublished(id) { calls.push(`published:${id}`); }, async markFailed() { calls.push('failed'); } };
    const publisher: IntegrationPublisher = { async publish(value) { calls.push(`publish:${value.id}`); } };
    const relay = new OutboxRelay(repository, publisher, { maximumAttempts: 5, initialDelayMs: 100, maximumDelayMs: 1000, multiplier: 2, jitterRatio: 0 });
    expect(await relay.runOnce({ workerId: 'worker-1', limit: 10, leaseMs: 30000, now: new Date(), signal: new AbortController().signal })).toBe(1);
    expect(calls).toEqual(['publish:evt-1', 'published:evt-1']);
  });

  it('publish hiba után korlátos retry állapotot kér', async () => {
    const calls: number[] = [];
    const repository: OutboxRepository = { async claimBatch() { return [message]; }, async markPublished() {}, async markFailed(input) { calls.push(input.maximumAttempts); } };
    const publisher: IntegrationPublisher = { async publish() { throw new Error('unavailable'); } };
    const relay = new OutboxRelay(repository, publisher, { maximumAttempts: 5, initialDelayMs: 100, maximumDelayMs: 1000, multiplier: 2, jitterRatio: 0 });
    expect(await relay.runOnce({ workerId: 'worker-1', limit: 10, leaseMs: 30000, now: new Date(), signal: new AbortController().signal })).toBe(0);
    expect(calls).toEqual([5]);
  });
});
