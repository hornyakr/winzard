import { z } from 'zod';
export const envSchema = z.object({ APP_URL: z.url(), APP_NAME: z.string().min(1), LOG_LEVEL: z.enum(['debug','info','warn','error']), NEXT_PUBLIC_APP_NAME: z.string().min(1), DATABASE_URL: z.string().startsWith('postgres'), DATABASE_POOL_MAX: z.coerce.number().int().positive(), DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive(), AUTH_SECRET: z.string().min(32) });
export type Environment = z.infer<typeof envSchema>;
export function parseEnvironment(input: NodeJS.ProcessEnv | Record<string,string|undefined>): Environment { return envSchema.parse(input); }
