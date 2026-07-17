import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseDotenv } from 'dotenv';

import type { WinzardManifest } from './manifest';

export type EnvironmentFailure = Readonly<{
  code: string;
  file: string;
  message: string;
}>;

async function loadEnvironment(root: string): Promise<Record<string, string | undefined>> {
  const environment: Record<string, string | undefined> = { ...process.env };

  try {
    const parsed = parseDotenv(await readFile(path.join(root, '.env'), 'utf8'));
    for (const [key, value] of Object.entries(parsed)) environment[key] ??= value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  return environment;
}

function positiveInteger(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

export async function checkCapabilityEnvironment(
  root: string,
  manifest: WinzardManifest,
): Promise<readonly EnvironmentFailure[]> {
  const environment = await loadEnvironment(root);
  const failures: EnvironmentFailure[] = [];
  const capabilities = new Set(manifest.capabilities);

  if (capabilities.has('prisma-postgresql')) {
    const databaseUrl = environment.DATABASE_URL;
    if (databaseUrl === undefined || !/^postgres(?:ql)?:\/\//u.test(databaseUrl)) {
      failures.push({ code: 'DATABASE_URL_INVALID', file: '.env', message: 'A PostgreSQL capability érvényes DATABASE_URL változót igényel.' });
    }
    if (!positiveInteger(environment.DATABASE_POOL_MAX)) {
      failures.push({ code: 'DATABASE_POOL_MAX_INVALID', file: '.env', message: 'A DATABASE_POOL_MAX pozitív egész szám legyen.' });
    }
    if (!positiveInteger(environment.DATABASE_CONNECTION_TIMEOUT_MS)) {
      failures.push({ code: 'DATABASE_TIMEOUT_INVALID', file: '.env', message: 'A DATABASE_CONNECTION_TIMEOUT_MS pozitív egész szám legyen.' });
    }
  }

  if (capabilities.has('authentication')) {
    const secret = environment.AUTH_SECRET;
    if (secret === undefined || secret.length < 32) {
      failures.push({ code: 'AUTH_SECRET_INVALID', file: '.env', message: 'Az authentication capability legalább 32 karakteres AUTH_SECRET értéket igényel.' });
    }
  }

  return failures;
}
