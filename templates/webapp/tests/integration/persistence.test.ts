import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { database } from '@/platform/database/client';
import { assertDatabaseReady } from '@/platform/database/readiness';
import { PrismaInboxRepository, PrismaOutboxRepository } from '@/platform/messaging/prisma-outbox.repository';

async function clearMessagingTables(): Promise<void> {
  await database.$transaction([
    database.deadLetterMessage.deleteMany(),
    database.inboxMessage.deleteMany(),
    database.outboxMessage.deleteMany(),
  ]);
}

describe('PostgreSQL persistence contracts', () => {
  beforeEach(clearMessagingTables);
  afterAll(async () => database.$disconnect());

  it('read-only readiness lekérdezést futtat', async () => {
    await expect(assertDatabaseReady()).resolves.toBeUndefined();
  });

  it('transaction rollback esetén nem hagy részleges outbox rekordot', async () => {
    const id = randomUUID();
    await expect(database.$transaction(async (tx) => {
      await tx.outboxMessage.create({
        data: {
          id,
          source: 'urn:winzard:test',
          type: 'test.rollback.v1',
          occurredAt: new Date('2026-07-22T10:00:00.000Z'),
          payload: { id },
          metadata: {},
        },
      });
      throw new Error('rollback');
    })).rejects.toThrow('rollback');

    await expect(database.outboxMessage.count({ where: { id } })).resolves.toBe(0);
  });

  it('SKIP LOCKED claim korlátosan és stabil sorrendben foglal', async () => {
    const first = randomUUID();
    const second = randomUUID();
    const availableAt = new Date('2026-07-22T09:59:00.000Z');
    await database.outboxMessage.createMany({
      data: [
        {
          id: first,
          source: 'urn:winzard:test',
          type: 'test.claim.v1',
          occurredAt: new Date('2026-07-22T10:00:00.000Z'),
          availableAt,
          payload: { id: first },
          metadata: {},
        },
        {
          id: second,
          source: 'urn:winzard:test',
          type: 'test.claim.v1',
          occurredAt: new Date('2026-07-22T10:00:01.000Z'),
          availableAt,
          payload: { id: second },
          metadata: {},
        },
      ],
    });

    const repository = new PrismaOutboxRepository(database);
    const now = new Date('2026-07-22T10:01:00.000Z');
    const claimedFirst = await repository.claimBatch({ workerId: 'worker-a', limit: 1, now, leaseMs: 30_000 });
    const claimedSecond = await repository.claimBatch({ workerId: 'worker-b', limit: 1, now, leaseMs: 30_000 });

    expect(claimedFirst.map(({ id }) => id)).toEqual([first]);
    expect(claimedSecond.map(({ id }) => id)).toEqual([second]);
  });

  it('az inbox compound key idempotensen kiszűri a duplikációt', async () => {
    const repository = new PrismaInboxRepository();
    const eventId = randomUUID();
    const result = await database.$transaction(async (tx) => {
      const first = await repository.tryRecord({ consumerId: 'billing', source: 'urn:winzard:test', eventId }, tx);
      const duplicate = await repository.tryRecord({ consumerId: 'billing', source: 'urn:winzard:test', eventId }, tx);
      return { first, duplicate };
    });

    expect(result).toEqual({ first: true, duplicate: false });
    await expect(database.inboxMessage.count()).resolves.toBe(1);
  });
});
