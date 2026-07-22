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
