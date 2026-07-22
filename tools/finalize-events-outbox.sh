#!/usr/bin/env bash
set -euo pipefail

mkdir -p templates/webapp/src/platform/messaging
mkdir -p templates/webapp/src/composition
mkdir -p templates/webapp/tests/unit/platform/messaging
mkdir -p templates/webapp/prisma/migrations/20260722130000_event_messaging

cat > templates/webapp/prisma/schema.prisma <<'EOF'
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model OutboxMessage {
  id                String   @id
  source            String
  type              String
  subject           String?
  occurredAt        DateTime
  aggregateId       String?
  aggregateSequence BigInt?
  payload           Json
  metadata          Json
  status            String   @default("pending")
  attempts          Int      @default(0)
  availableAt       DateTime @default(now())
  lockedAt          DateTime?
  lockedBy          String?
  publishedAt       DateTime?
  lastErrorCode     String?
  createdAt         DateTime @default(now())

  @@index([status, availableAt])
  @@index([lockedAt])
  @@index([aggregateId, aggregateSequence])
}

model InboxMessage {
  consumerId  String
  source      String
  eventId     String
  processedAt DateTime @default(now())
  resultHash  String?

  @@id([consumerId, source, eventId])
}

model DeadLetterMessage {
  id            String   @id
  outboxId      String   @unique
  source        String
  type          String
  attempts      Int
  errorCode     String
  payloadHash   String
  correlationId String?
  createdAt     DateTime @default(now())

  @@index([type, createdAt])
}
EOF

cat > templates/webapp/prisma/migrations/20260722130000_event_messaging/migration.sql <<'EOF'
CREATE TABLE "OutboxMessage" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "subject" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "aggregateId" TEXT,
  "aggregateSequence" BIGINT,
  "payload" JSONB NOT NULL,
  "metadata" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutboxMessage_status_availableAt_idx" ON "OutboxMessage"("status", "availableAt");
CREATE INDEX "OutboxMessage_lockedAt_idx" ON "OutboxMessage"("lockedAt");
CREATE INDEX "OutboxMessage_aggregateId_aggregateSequence_idx" ON "OutboxMessage"("aggregateId", "aggregateSequence");

CREATE TABLE "InboxMessage" (
  "consumerId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resultHash" TEXT,
  CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("consumerId", "source", "eventId")
);

CREATE TABLE "DeadLetterMessage" (
  "id" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "errorCode" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeadLetterMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeadLetterMessage_outboxId_key" ON "DeadLetterMessage"("outboxId");
CREATE INDEX "DeadLetterMessage_type_createdAt_idx" ON "DeadLetterMessage"("type", "createdAt");
EOF

cat > templates/webapp/src/platform/messaging/outbox.ts <<'EOF'
import type { IntegrationEventEnvelope } from '@/platform/events/contract';

export type OutboxMessage = Readonly<{
  id: string;
  source: string;
  type: string;
  subject: string | null;
  occurredAt: Date;
  aggregateId: string | null;
  aggregateSequence: bigint | null;
  payload: Readonly<Record<string, unknown>>;
  metadata: Readonly<Record<string, unknown>>;
  attempts: number;
}>;

export interface OutboxWriter {
  append(events: readonly IntegrationEventEnvelope[], transaction: unknown): Promise<void>;
}

export interface OutboxRepository {
  claimBatch(input: Readonly<{ workerId: string; limit: number; now: Date; leaseMs: number }>): Promise<readonly OutboxMessage[]>;
  markPublished(id: string, publishedAt: Date): Promise<void>;
  markFailed(input: Readonly<{ message: OutboxMessage; errorCode: string; now: Date; nextAttemptAt: Date; maximumAttempts: number }>): Promise<void>;
}

export interface IntegrationPublisher {
  publish(message: OutboxMessage, options: Readonly<{ signal: AbortSignal }>): Promise<void>;
}

export interface InboxRepository {
  tryRecord(input: Readonly<{ consumerId: string; source: string; eventId: string; resultHash?: string }>, transaction: unknown): Promise<boolean>;
}

export type RetryPolicy = Readonly<{
  maximumAttempts: number;
  initialDelayMs: number;
  maximumDelayMs: number;
  multiplier: number;
  jitterRatio: number;
}>;

export function retryDelayMs(policy: RetryPolicy, attempts: number, random = Math.random): number {
  const base = Math.min(policy.maximumDelayMs, policy.initialDelayMs * policy.multiplier ** Math.max(0, attempts));
  const jitter = base * policy.jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

export class OutboxRelay {
  constructor(
    private readonly outbox: OutboxRepository,
    private readonly publisher: IntegrationPublisher,
    private readonly policy: RetryPolicy,
  ) {}

  async runOnce(input: Readonly<{ workerId: string; limit: number; leaseMs: number; now: Date; signal: AbortSignal }>): Promise<number> {
    const messages = await this.outbox.claimBatch({ workerId: input.workerId, limit: input.limit, now: input.now, leaseMs: input.leaseMs });
    let published = 0;
    for (const message of messages) {
      if (input.signal.aborted) throw input.signal.reason;
      try {
        await this.publisher.publish(message, { signal: input.signal });
        await this.outbox.markPublished(message.id, new Date());
        published += 1;
      } catch (error) {
        const errorCode = error instanceof Error ? error.name : 'UNKNOWN';
        const delay = retryDelayMs(this.policy, message.attempts);
        await this.outbox.markFailed({ message, errorCode, now: input.now, nextAttemptAt: new Date(input.now.getTime() + delay), maximumAttempts: this.policy.maximumAttempts });
      }
    }
    return published;
  }
}
EOF

cat > templates/webapp/src/platform/messaging/prisma-outbox.repository.ts <<'EOF'
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
EOF

cat > templates/webapp/src/composition/messaging.server.ts <<'EOF'
import 'server-only';
import { database } from '@/platform/database/client';
import { PrismaInboxRepository, PrismaOutboxRepository, PrismaOutboxWriter } from '@/platform/messaging/prisma-outbox.repository';

export const outboxWriter = new PrismaOutboxWriter();
export const outboxRepository = new PrismaOutboxRepository(database);
export const inboxRepository = new PrismaInboxRepository();
export const messaging = Object.freeze({ outboxWriter, outboxRepository, inboxRepository });
EOF

cat > templates/webapp/src/composition/messaging.composition.definition.ts <<'EOF'
import { defineComposition } from '@/platform/composition/contract';

export const messagingComposition = defineComposition({
  schemaVersion: 1,
  id: 'platform.messaging',
  capability: 'transactional-outbox',
  roots: [{ id: 'platform.messaging.root', source: 'src/composition/messaging.server.ts', export: 'messaging', runtime: 'nodejs', services: ['platform.messaging.outbox-writer', 'platform.messaging.outbox-repository', 'platform.messaging.inbox-repository'] }],
  services: [
    { id: 'platform.messaging.outbox-writer', kind: 'infrastructure', implementation: 'PrismaOutboxWriter', port: 'OutboxWriter', source: 'src/platform/messaging/prisma-outbox.repository.ts', export: 'PrismaOutboxWriter', lifetime: 'process', runtime: 'nodejs', visibility: 'private', dependencies: ['platform.database.client'] },
    { id: 'platform.messaging.outbox-repository', kind: 'infrastructure', implementation: 'PrismaOutboxRepository', port: 'OutboxRepository', source: 'src/platform/messaging/prisma-outbox.repository.ts', export: 'PrismaOutboxRepository', lifetime: 'process', runtime: 'nodejs', visibility: 'private', dependencies: ['platform.database.client'] },
    { id: 'platform.messaging.inbox-repository', kind: 'infrastructure', implementation: 'PrismaInboxRepository', port: 'InboxRepository', source: 'src/platform/messaging/prisma-outbox.repository.ts', export: 'PrismaInboxRepository', lifetime: 'process', runtime: 'nodejs', visibility: 'private', dependencies: ['platform.database.client'] },
  ],
});
EOF

cat > templates/webapp/tests/unit/platform/messaging/outbox.test.ts <<'EOF'
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
EOF

mkdir -p recipes/transactional-outbox/files/src/platform/messaging
mkdir -p recipes/transactional-outbox/files/src/composition
mkdir -p recipes/transactional-outbox/files/prisma/migrations/20260722130000_event_messaging
cp templates/webapp/src/platform/messaging/outbox.ts recipes/transactional-outbox/files/src/platform/messaging/outbox.ts
cp templates/webapp/src/platform/messaging/prisma-outbox.repository.ts recipes/transactional-outbox/files/src/platform/messaging/prisma-outbox.repository.ts
cp templates/webapp/src/composition/messaging.server.ts recipes/transactional-outbox/files/src/composition/messaging.server.ts
cp templates/webapp/src/composition/messaging.composition.definition.ts recipes/transactional-outbox/files/src/composition/messaging.composition.definition.ts
cp templates/webapp/prisma/schema.prisma recipes/transactional-outbox/files/prisma/schema.prisma
cp templates/webapp/prisma/migrations/20260722130000_event_messaging/migration.sql recipes/transactional-outbox/files/prisma/migrations/20260722130000_event_messaging/migration.sql
