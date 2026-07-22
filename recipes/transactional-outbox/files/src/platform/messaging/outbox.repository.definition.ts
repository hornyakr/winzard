export const repositoryDefinition = {
  schemaVersion: 1,
  id: 'platform.messaging.outbox',
  port: 'src/platform/messaging/outbox.ts#OutboxRepository',
  adapter: 'src/platform/messaging/prisma-outbox.repository.ts#PrismaOutboxRepository',
  models: ['OutboxMessage', 'InboxMessage', 'DeadLetterMessage'],
  role: 'read-write',
  tenantScoped: false,
  softDelete: false,
  optimisticConcurrency: false,
  transaction: 'supported',
  queries: [
    {
      id: 'claim-batch',
      bounded: true,
      tenantScoped: false,
      stableOrder: ['occurredAt', 'id'],
      requiredIndexes: ['OutboxMessage_status_availableAt_idx'],
    },
  ],
} as const;
