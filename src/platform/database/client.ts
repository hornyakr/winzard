import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { serverEnvironment } from '@/platform/config/env.server';
const globalDb = globalThis as unknown as { db?: PrismaClient };
export const db = globalDb.db ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: serverEnvironment.DATABASE_URL, max: serverEnvironment.DATABASE_POOL_MAX, connectionTimeoutMillis: serverEnvironment.DATABASE_CONNECTION_TIMEOUT_MS }) });
if (process.env.NODE_ENV !== 'production') globalDb.db = db;
