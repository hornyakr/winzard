import 'server-only';

import { database } from './client';
import { getDatabaseEnvironment } from './database-env.server';

export async function assertDatabaseReady(): Promise<void> {
  const environment = getDatabaseEnvironment();
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new Error('Database readiness timeout')),
      environment.DATABASE_CONNECTION_TIMEOUT_MS,
    );
  });

  await Promise.race([database.$queryRawUnsafe('SELECT 1'), timeout]);
}
