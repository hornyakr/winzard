import 'server-only';

import { z } from 'zod';

const knownUnsafeSecrets = new Set([
  'secret',
  'password',
  'changeme',
  'development-secret',
  'default-secret',
  'test-secret',
  '<secret>',
]);

function looksGenerated(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !knownUnsafeSecrets.has(normalized) &&
    !/^<.*>$/u.test(value.trim()) &&
    !normalized.includes('development-secret') &&
    !normalized.includes('default-secret') &&
    new Set(value).size >= 8;
}

export const authEnvironmentSchema = z.object({
  AUTH_SECRET: z.string().min(32).refine(
    looksGenerated,
    'AUTH_SECRET must be a generated high-entropy secret.',
  ),
});

export type AuthEnvironment = z.infer<typeof authEnvironmentSchema>;

export function getAuthEnvironment(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): AuthEnvironment {
  return Object.freeze(authEnvironmentSchema.parse({ AUTH_SECRET: input.AUTH_SECRET }));
}
