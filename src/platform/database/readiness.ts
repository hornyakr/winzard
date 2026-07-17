import 'server-only';
import { db } from './client';
import { serverEnvironment } from '@/platform/config/env.server';
export async function assertDatabaseReady(): Promise<void> { const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Database readiness timeout')), serverEnvironment.DATABASE_CONNECTION_TIMEOUT_MS)); await Promise.race([db.$queryRawUnsafe('SELECT 1'), timeout]); }
