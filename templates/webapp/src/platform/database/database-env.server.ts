import 'server-only';

import { z } from 'zod';

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//u),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive(),
});

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;

export function getDatabaseEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): DatabaseEnvironment {
  return databaseEnvironmentSchema.parse(input);
}
