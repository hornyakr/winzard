import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

import { getDatabaseEnvironment } from './database-env.server';

const environment = getDatabaseEnvironment();
const globalDatabase = globalThis as unknown as { database?: PrismaClient };

export const database = globalDatabase.database ?? new PrismaClient({
  adapter: new PrismaPg({
    connectionString: environment.DATABASE_URL,
    max: environment.DATABASE_POOL_MAX,
    connectionTimeoutMillis: environment.DATABASE_CONNECTION_TIMEOUT_MS,
  }),
});

if (process.env.NODE_ENV !== 'production') globalDatabase.database = database;
