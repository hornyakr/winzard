import 'server-only';

import { z } from 'zod';

export const databaseUrlSchema = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    context.addIssue({
      code: 'custom',
      message: 'DATABASE_URL must be a PostgreSQL DSN.',
    });
  }
  if (url.hostname === '' || url.pathname === '' || url.pathname === '/') {
    context.addIssue({
      code: 'custom',
      message: 'DATABASE_URL must include a host and database name.',
    });
  }
});

function boundedIntegerEnvironmentValue(minimum: number, maximum: number) {
  return z.string()
    .trim()
    .regex(/^\d+$/u, 'The value must be an integer.')
    .transform(Number)
    .pipe(z.number().int().min(minimum).max(maximum));
}

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  DATABASE_POOL_MAX: boundedIntegerEnvironmentValue(1, 100),
  DATABASE_CONNECTION_TIMEOUT_MS: boundedIntegerEnvironmentValue(100, 60_000),
});

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;

export function getDatabaseEnvironment(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): DatabaseEnvironment {
  return Object.freeze(databaseEnvironmentSchema.parse({
    DATABASE_URL: input.DATABASE_URL,
    DATABASE_POOL_MAX: input.DATABASE_POOL_MAX,
    DATABASE_CONNECTION_TIMEOUT_MS: input.DATABASE_CONNECTION_TIMEOUT_MS,
  }));
}
