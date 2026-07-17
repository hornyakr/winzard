import { readFile } from 'node:fs/promises';
import path from 'node:path';


import type { WinzardManifest } from './manifest';

export type EnvironmentFailure = Readonly<{
  code: string;
  file: string;
  message: string;
}>;

function parseDotenv(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of source.replaceAll('\r\n', '\n').split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

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
