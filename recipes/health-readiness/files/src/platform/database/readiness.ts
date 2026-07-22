import 'server-only';

import { database } from './client';
import { getDatabaseEnvironment } from './database-env.server';

export async function assertDatabaseReady(): Promise<void> {
  const environment = getDatabaseEnvironment();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Database readiness timeout')),
      environment.DATABASE_CONNECTION_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([
      database.$queryRaw<readonly { ready: number }[]>`SELECT 1 AS ready`,
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
