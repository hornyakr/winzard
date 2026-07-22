import 'server-only';

import { z } from 'zod';

const ALLOWED_APP_PROTOCOLS = new Set(['http:', 'https:']);

export const deploymentStageSchema = z.enum([
  'local',
  'development',
  'preview',
  'staging',
  'production',
]);

export const appOriginSchema = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (!ALLOWED_APP_PROTOCOLS.has(url.protocol)) {
    context.addIssue({
      code: 'custom',
      message: 'APP_URL must use the http or https protocol.',
    });
  }
  if (
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    context.addIssue({
      code: 'custom',
      message: 'APP_URL must be a credential-free origin without path, query or fragment.',
    });
  }
});

export const appEnvironmentSchema = z.object({
  APP_URL: appOriginSchema,
  APP_NAME: z.string().trim().min(1).max(128),
  APP_STAGE: deploymentStageSchema,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
}).superRefine((value, context) => {
  if (value.APP_STAGE === 'production' && new URL(value.APP_URL).protocol !== 'https:') {
    context.addIssue({
      code: 'custom',
      path: ['APP_URL'],
      message: 'APP_URL must use https in the production stage.',
    });
  }
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;

export type AppConfig = Readonly<{
  origin: URL;
  name: string;
  stage: z.infer<typeof deploymentStageSchema>;
  logLevel: AppEnvironment['LOG_LEVEL'];
}>;

export function readAppEnvironmentInput(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
): Readonly<Record<keyof AppEnvironment, string | undefined>> {
  return {
    APP_URL: input.APP_URL,
    APP_NAME: input.APP_NAME,
    APP_STAGE: input.APP_STAGE,
    LOG_LEVEL: input.LOG_LEVEL,
  };
}

export function parseAppEnvironment(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
): AppEnvironment {
  return appEnvironmentSchema.parse(readAppEnvironmentInput(input));
}

export function createAppConfig(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): AppConfig {
  const environment = parseAppEnvironment(input);
  return Object.freeze({
    origin: new URL(environment.APP_URL),
    name: environment.APP_NAME,
    stage: environment.APP_STAGE,
    logLevel: environment.LOG_LEVEL,
  });
}
