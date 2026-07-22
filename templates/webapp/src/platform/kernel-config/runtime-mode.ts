import { KernelConfigurationError } from './kernel-config.errors';

export const runtimeModes = ['web', 'cli', 'worker'] as const;
export type RuntimeMode = (typeof runtimeModes)[number];

export type RuntimeModeContext = Readonly<{
  mode: RuntimeMode;
  longRunning: boolean;
}>;

export type WorkerRuntimeConfig = RuntimeModeContext & Readonly<{
  mode: 'worker';
  concurrency: number;
  visibilityTimeoutMs: number;
  shutdownGraceMs: number;
  pollIntervalMs: number;
}>;

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const raw = value ?? String(fallback);
  if (!/^\d+$/u.test(raw)) {
    throw new KernelConfigurationError(
      'KERNEL_RUNTIME_MODE_AMBIGUOUS',
      `${name} egész szám legyen.`,
    );
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new KernelConfigurationError(
      'KERNEL_RUNTIME_MODE_AMBIGUOUS',
      `${name} ${minimum} és ${maximum} közötti safe integer legyen.`,
    );
  }
  return parsed;
}

export function createRuntimeMode(mode: RuntimeMode): RuntimeModeContext {
  return Object.freeze({ mode, longRunning: mode !== 'cli' });
}

export function createWebRuntimeMode(): RuntimeModeContext {
  return createRuntimeMode('web');
}

export function createCliRuntimeMode(): RuntimeModeContext {
  return createRuntimeMode('cli');
}

export function createWorkerRuntimeMode(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>> = process.env,
): WorkerRuntimeConfig {
  const concurrency = boundedInteger(input.WORKER_CONCURRENCY, 4, 1, 128, 'WORKER_CONCURRENCY');
  const visibilityTimeoutMs = boundedInteger(
    input.WORKER_VISIBILITY_TIMEOUT_MS,
    60_000,
    1_000,
    86_400_000,
    'WORKER_VISIBILITY_TIMEOUT_MS',
  );
  const shutdownGraceMs = boundedInteger(
    input.WORKER_SHUTDOWN_GRACE_MS,
    30_000,
    1_000,
    300_000,
    'WORKER_SHUTDOWN_GRACE_MS',
  );
  const pollIntervalMs = boundedInteger(
    input.WORKER_POLL_INTERVAL_MS,
    1_000,
    10,
    60_000,
    'WORKER_POLL_INTERVAL_MS',
  );
  return Object.freeze({
    mode: 'worker',
    longRunning: true,
    concurrency,
    visibilityTimeoutMs,
    shutdownGraceMs,
    pollIntervalMs,
  });
}
