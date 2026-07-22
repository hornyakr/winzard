import { z } from 'zod';

import { KernelConfigurationError } from './kernel-config.errors';

export const applicationStages = [
  'local',
  'development',
  'preview',
  'staging',
  'production',
] as const;

export const configurationEnvironments = [
  'development',
  'production',
  'test',
] as const;

export type ApplicationStage = (typeof applicationStages)[number];
export type ConfigurationEnvironment =
  (typeof configurationEnvironments)[number];
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type DebugPolicy = Readonly<{
  verboseLogs: boolean;
  exposeSafeDiagnostics: boolean;
  includeDependencyTimings: boolean;
  browserSourceMaps: boolean;
  waiver?: string;
}>;

export type RuntimeEnvironment = Readonly<{
  configuration: ConfigurationEnvironment;
  stage: ApplicationStage;
  region?: string;
  logLevel: LogLevel;
  debug: DebugPolicy;
}>;

function booleanInput(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new KernelConfigurationError(
    'KERNEL_DEBUG_EXPOSES_INTERNALS',
    `A boolean konfiguráció csak true vagy false lehet; kapott érték: ${value}.`,
  );
}

const schema = z.object({
  NODE_ENV: z.enum(configurationEnvironments),
  APP_STAGE: z.enum(applicationStages),
  APP_REGION: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
  KERNEL_VERBOSE_DIAGNOSTICS: z.boolean(),
  PRODUCTION_BROWSER_SOURCE_MAPS: z.boolean(),
  PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER: z.string().trim().min(1).optional(),
}).superRefine((value, context) => {
  if (
    ['preview', 'staging', 'production'].includes(value.APP_STAGE) &&
    value.NODE_ENV !== 'production'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['NODE_ENV'],
      message: `${value.APP_STAGE} stage production NODE_ENV-et igényel.`,
    });
  }
  if (
    value.APP_STAGE === 'production' &&
    value.PRODUCTION_BROWSER_SOURCE_MAPS &&
    !value.PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER
  ) {
    context.addIssue({
      code: 'custom',
      path: ['PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER'],
      message: 'Production browser source map csak explicit waiverrel engedélyezhető.',
    });
  }
});

export function createRuntimeEnvironment(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): RuntimeEnvironment {
  const parsed = schema.safeParse({
    NODE_ENV: input.NODE_ENV ?? 'development',
    APP_STAGE: input.APP_STAGE ?? 'local',
    APP_REGION: input.APP_REGION || undefined,
    LOG_LEVEL: input.LOG_LEVEL ?? 'info',
    KERNEL_VERBOSE_DIAGNOSTICS: booleanInput(
      input.KERNEL_VERBOSE_DIAGNOSTICS,
      input.NODE_ENV !== 'production',
    ),
    PRODUCTION_BROWSER_SOURCE_MAPS: booleanInput(
      input.PRODUCTION_BROWSER_SOURCE_MAPS,
      false,
    ),
    PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER:
      input.PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER || undefined,
  });
  if (!parsed.success) {
    const stageIssue = parsed.error.issues.find(({ path }) => path[0] === 'APP_STAGE');
    const environmentIssue = parsed.error.issues.find(({ path }) => path[0] === 'NODE_ENV');
    throw new KernelConfigurationError(
      stageIssue
        ? 'KERNEL_STAGE_INVALID'
        : environmentIssue
          ? 'KERNEL_ENVIRONMENT_STAGE_CONFLICT'
          : 'KERNEL_DEBUG_EXPOSES_INTERNALS',
      parsed.error.issues.map(({ message }) => message).join(' '),
    );
  }
  return Object.freeze({
    configuration: parsed.data.NODE_ENV,
    stage: parsed.data.APP_STAGE,
    ...(parsed.data.APP_REGION ? { region: parsed.data.APP_REGION } : {}),
    logLevel: parsed.data.LOG_LEVEL,
    debug: Object.freeze({
      verboseLogs: parsed.data.KERNEL_VERBOSE_DIAGNOSTICS,
      exposeSafeDiagnostics: parsed.data.KERNEL_VERBOSE_DIAGNOSTICS,
      includeDependencyTimings: parsed.data.KERNEL_VERBOSE_DIAGNOSTICS,
      browserSourceMaps: parsed.data.PRODUCTION_BROWSER_SOURCE_MAPS,
      ...(parsed.data.PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER
        ? { waiver: parsed.data.PRODUCTION_BROWSER_SOURCE_MAPS_WAIVER }
        : {}),
    }),
  });
}
