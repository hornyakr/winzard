import { z } from 'zod';

export const appEnvironmentSchema = z.object({
  APP_URL: z.url(),
  APP_NAME: z.string().trim().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1),
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export function parseAppEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): AppEnvironment {
  return appEnvironmentSchema.parse(input);
}
