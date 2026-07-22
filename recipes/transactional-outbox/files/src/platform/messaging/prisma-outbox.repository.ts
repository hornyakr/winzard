import 'server-only';
import { createHash, randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { IntegrationEventEnvelope } from '@/platform/events/contract';
import type { InboxRepository, OutboxMessage, OutboxRepository, OutboxWriter } from './outbox';

type Transaction = Prisma.TransactionClient;

function transaction(value: unknown): Transaction {
  if (typeof value !== 'object' || value === null) throw new TypeError('Prisma transaction context is required.');
  return value as Transaction;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class PrismaOutboxWriter implements OutboxWriter {
  async append(events: readonly IntegrationEventEnvelope[], context: unknown): Promise<void> {
    if (events.length === 0) return;
    const tx = transaction(context);
    await tx.outboxMessage.createMany({ data: events.map((event) => ({
      id: event.id,
      source: event.source,
      type: event.type,
      subject: event.subject ?? null,
      occurredAt: new Date(event.time),
      aggregateId: event.subject ?? null,
      payload: json(event.data),
      metadata: json({ correlationId: event.correlationid, causationId: event.causationid, tenantId: event.tenantid, traceparent: event.traceparent }),
    })) });
  }
}

export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly database: PrismaClient) {}

  async claimBatch(input: Readonly<{ workerId: string; limit: number; now: Date; leaseMs: number }>): Promise<readonly OutboxMessage[]> {
    const leaseExpiredAt = new Date(input.now.getTime() - input.leaseMs);
    return this.database.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<readonly OutboxMessage[]>(Prisma.sql`
        WITH candidates AS (
          SELECT "id"
          FROM "OutboxMessage"
          WHERE "status" = 'pending'
            AND "availableAt" <= ${input.now}
            AND ("lockedAt" IS NULL OR "lockedAt" < ${leaseExpiredAt})
          ORDER BY "occurredAt", "id"
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE "OutboxMessage" AS message
        SET "status" = 'processing', "lockedAt" = ${input.now}, "lockedBy" = ${input.workerId}
        FROM candidates
        WHERE message."id" = candidates."id"
        RETURNING message."id", message."source", message."type", message."subject", message."occurredAt",
          message."aggregateId", message."aggregateSequence", message."payload", message."metadata", message."attempts"
      `);
      return Object.freeze(rows.map((row) => Object.freeze(row)));
    });
  }

  async markPublished(id: string, publishedAt: Date): Promise<void> {
    await this.database.outboxMessage.update({ where: { id }, data: { status: 'published', publishedAt, lockedAt: null, lockedBy: null } });
  }

  async markFailed(input: Readonly<{ message: OutboxMessage; errorCode: string; now: Date; nextAttemptAt: Date; maximumAttempts: number }>): Promise<void> {
    const attempts = input.message.attempts + 1;
    if (attempts < input.maximumAttempts) {
      await this.database.outboxMessage.update({ where: { id: input.message.id }, data: { status: 'pending', attempts, availableAt: input.nextAttemptAt, lastErrorCode: input.errorCode, lockedAt: null, lockedBy: null } });
      return;
    }
    const payloadHash = createHash('sha256').update(JSON.stringify(input.message.payload)).digest('hex');
    const correlationId = typeof input.message.metadata.correlationId === 'string' ? input.message.metadata.correlationId : null;
    await this.database.$transaction([
      this.database.deadLetterMessage.create({ data: { id: randomUUID(), outboxId: input.message.id, source: input.message.source, type: input.message.type, attempts, errorCode: input.errorCode, payloadHash, correlationId } }),
      this.database.outboxMessage.update({ where: { id: input.message.id }, data: { status: 'dead-letter', attempts, lastErrorCode: input.errorCode, lockedAt: null, lockedBy: null } }),
    ]);
  }
}

export class PrismaInboxRepository implements InboxRepository {
  async tryRecord(input: Readonly<{ consumerId: string; source: string; eventId: string; resultHash?: string }>, context: unknown): Promise<boolean> {
    try {
      await transaction(context).inboxMessage.create({ data: { consumerId: input.consumerId, source: input.source, eventId: input.eventId, resultHash: input.resultHash } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }
}
