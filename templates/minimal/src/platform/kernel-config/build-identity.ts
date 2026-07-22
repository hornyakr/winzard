import { KernelConfigurationError } from './kernel-config.errors';
import type { ApplicationStage } from './runtime-environment';

const GIT_COMMIT = /^[0-9a-f]{7,64}$/u;
const PORTABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export type BuildIdentity = Readonly<{
  gitCommit: string;
  buildId: string;
  deploymentId: string;
  sourceDateEpoch?: number;
}>;

export function parseSourceDateEpoch(
  value: string | undefined,
): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  if (!/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new KernelConfigurationError(
      'KERNEL_SOURCE_DATE_EPOCH_INVALID',
      'SOURCE_DATE_EPOCH egész, nem negatív Unix timestamp legyen.',
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new KernelConfigurationError(
      'KERNEL_SOURCE_DATE_EPOCH_INVALID',
      'SOURCE_DATE_EPOCH kívül esik a safe integer tartományon.',
    );
  }
  return parsed;
}

function portableId(value: string, code:
  | 'KERNEL_BUILD_ID_MISSING'
  | 'KERNEL_DEPLOYMENT_ID_MISSING', label: string): string {
  const normalized = value.trim();
  if (!PORTABLE_ID.test(normalized)) {
    throw new KernelConfigurationError(
      code,
      `${label} 1–128 karakteres, hordozható azonosító legyen.`,
    );
  }
  return normalized;
}

export function createBuildIdentity(
  input: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
  stage: ApplicationStage,
): BuildIdentity {
  const release = ['preview', 'staging', 'production'].includes(stage);
  const gitCommitInput = input.GIT_COMMIT?.trim();
  if (release && !gitCommitInput) {
    throw new KernelConfigurationError(
      'KERNEL_BUILD_ID_MISSING',
      'Release buildhez GIT_COMMIT szükséges.',
    );
  }
  const gitCommit = gitCommitInput ?? '0000000';
  if (!GIT_COMMIT.test(gitCommit)) {
    throw new KernelConfigurationError(
      'KERNEL_BUILD_ID_MISSING',
      'GIT_COMMIT 7–64 karakteres kisbetűs hexadecimális commitazonosító legyen.',
    );
  }
  const buildId = portableId(input.BUILD_ID ?? gitCommit, 'KERNEL_BUILD_ID_MISSING', 'BUILD_ID');
  const deploymentInput = input.DEPLOYMENT_ID?.trim();
  if (release && !deploymentInput) {
    throw new KernelConfigurationError(
      'KERNEL_DEPLOYMENT_ID_MISSING',
      'Preview, staging és production stage-ben DEPLOYMENT_ID szükséges.',
    );
  }
  const deploymentId = portableId(
    deploymentInput ?? `local-${buildId.slice(0, 16)}`,
    'KERNEL_DEPLOYMENT_ID_MISSING',
    'DEPLOYMENT_ID',
  );
  const sourceDateEpoch = parseSourceDateEpoch(input.SOURCE_DATE_EPOCH);
  if (release && sourceDateEpoch === undefined) {
    throw new KernelConfigurationError(
      'KERNEL_SOURCE_DATE_EPOCH_INVALID',
      'Release buildhez SOURCE_DATE_EPOCH szükséges.',
    );
  }
  return Object.freeze({
    gitCommit,
    buildId,
    deploymentId,
    ...(sourceDateEpoch === undefined ? {} : { sourceDateEpoch }),
  });
}
