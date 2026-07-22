import 'server-only';
import { database } from '@/platform/database/client';
import { PrismaInboxRepository, PrismaOutboxRepository, PrismaOutboxWriter } from '@/platform/messaging/prisma-outbox.repository';

export const outboxWriter = new PrismaOutboxWriter();
export const outboxRepository = new PrismaOutboxRepository(database);
export const inboxRepository = new PrismaInboxRepository();
export const messaging = Object.freeze({ outboxWriter, outboxRepository, inboxRepository });
