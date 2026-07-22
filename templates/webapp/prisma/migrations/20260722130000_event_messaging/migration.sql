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
