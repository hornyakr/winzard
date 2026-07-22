import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  ContractCompatibilityChange,
  ContractCompatibilityResult,
  ContractInventory,
  ContractIssue,
  ContractManifest,
} from './types';

const execFileAsync = promisify(execFile);

function manifestFromInventory(inventory: ContractInventory): ContractManifest {
  return Object.freeze({
    schemaVersion: 1,
    fingerprint: inventory.fingerprint,
    contracts: inventory.contracts,
    providers: inventory.providers,
  });
}

async function repositoryPath(root: string): Promise<Readonly<{ topLevel: string; projectPath: string }>> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: root });
  const topLevel = stdout.trim();
  const projectPath = path.relative(topLevel, root).split(path.sep).join('/');
  return Object.freeze({ topLevel, projectPath });
}

const EMPTY_BASELINE_FINGERPRINT = createHash('sha256')
  .update(JSON.stringify({ contracts: [], providers: [] }))
  .digest('hex');

function missingBaselineManifest(error: unknown, file: string): boolean {
  if (typeof error !== 'object' || error === null || !('stderr' in error)) return false;
  const stderr = String((error as { stderr?: unknown }).stderr ?? '');
  return stderr.includes(`path '${file}' does not exist in`) ||
    stderr.includes(`path '${file}' exists on disk, but not in`);
}

export async function loadBaselineManifest(root: string, base: string): Promise<ContractManifest> {
  const repository = await repositoryPath(root);
  const projectPrefix = repository.projectPath === '' ? '' : `${repository.projectPath}/`;
  const file = `${projectPrefix}src/generated/contracts/contract-manifest.json`;
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('git', ['show', `${base}:${file}`], {
      cwd: repository.topLevel,
      maxBuffer: 10 * 1024 * 1024,
    }));
  } catch (error) {
    if (!missingBaselineManifest(error, file)) throw error;
    return Object.freeze({
      schemaVersion: 1,
      fingerprint: EMPTY_BASELINE_FINGERPRINT,
      contracts: Object.freeze([]),
      providers: Object.freeze([]),
    });
  }
  const parsed = JSON.parse(stdout) as unknown;
  if (
    typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((parsed as { contracts?: unknown }).contracts) ||
    !Array.isArray((parsed as { providers?: unknown }).providers)
  ) {
    throw new TypeError(`Invalid contract manifest at ${base}:${file}.`);
  }
  return parsed as ContractManifest;
}

function behaviorSignature(contract: ContractManifest['contracts'][number]): string {
  return JSON.stringify({
    visibility: contract.visibility,
    categories: contract.categories,
    source: contract.source,
    exportName: contract.exportName,
    runtimeValidation: contract.runtimeValidation,
    runtimeSchema: contract.runtimeSchema,
    errorCodes: contract.errorCodes,
    cancellation: contract.cancellation,
    timeout: contract.timeout,
    concurrency: contract.concurrency,
    idempotency: contract.idempotency,
    securityClassification: contract.securityClassification,
    tenantScope: contract.tenantScope,
  });
}

export function compareContractManifests(
  currentInventory: ContractInventory,
  baseline: ContractManifest,
  base: string,
): ContractCompatibilityResult {
  const current = manifestFromInventory(currentInventory);
  const changes: ContractCompatibilityChange[] = [];
  const issues: ContractIssue[] = [];
  const currentById = new Map(current.contracts.map((contract) => [contract.id, contract]));
  const baselineById = new Map(baseline.contracts.map((contract) => [contract.id, contract]));

  for (const previous of baseline.contracts) {
    const next = currentById.get(previous.id);
    if (!next) {
      changes.push(Object.freeze({
        severity: previous.stability === 'experimental' ? 'warning' : 'breaking',
        code: 'CONTRACT_REMOVED',
        contractId: previous.id,
        message: `A ${previous.version} contract eltávolításra került.`,
      }));
      continue;
    }
    if (next.major < previous.major) {
      changes.push(Object.freeze({ severity: 'breaking', code: 'CONTRACT_VERSION_REGRESSION', contractId: previous.id, message: `A major verzió ${previous.major}-ról ${next.major}-ra csökkent.` }));
    }
    if (behaviorSignature(previous) !== behaviorSignature(next)) {
      const declaredMajor = next.major > previous.major;
      changes.push(Object.freeze({
        severity: declaredMajor || previous.stability === 'experimental' ? 'warning' : 'breaking',
        code: declaredMajor ? 'CONTRACT_BREAKING_CHANGE_DECLARED' : 'CONTRACT_BREAKING_CHANGE_UNDECLARED',
        contractId: previous.id,
        message: declaredMajor
          ? `A contract viselkedési felülete megváltozott és a major ${previous.major}-ról ${next.major}-ra nőtt.`
          : 'A contract viselkedési felülete major verzióemelés nélkül változott.',
      }));
    }
    if (previous.stability !== 'deprecated' && next.stability === 'deprecated' && next.deprecation === null) {
      issues.push(Object.freeze({ severity: 'error', area: 'deprecation', code: 'CONTRACT_DEPRECATION_MIGRATION_MISSING', file: next.definitionFile, contractId: next.id, message: 'A deprecated állapothoz migrációs metadata szükséges.' }));
    }
  }

  for (const next of current.contracts) {
    if (!baselineById.has(next.id)) {
      changes.push(Object.freeze({ severity: 'non-breaking', code: 'CONTRACT_ADDED', contractId: next.id, message: `Új ${next.stability} contract: ${next.version}.` }));
    }
  }

  const baselineProviders = new Set(baseline.providers.map(({ id }) => id));
  const currentProviders = new Set(current.providers.map(({ id }) => id));
  for (const id of baselineProviders) {
    if (!currentProviders.has(id)) {
      const provider = baseline.providers.find((item) => item.id === id);
      if (provider) changes.push(Object.freeze({ severity: 'warning', code: 'CONTRACT_PROVIDER_REMOVED', contractId: provider.contractId, message: `Provider eltávolítva: ${id}.` }));
    }
  }

  const compatible = !changes.some(({ severity }) => severity === 'breaking') && !issues.some(({ severity }) => severity === 'error');
  return Object.freeze({
    base,
    currentFingerprint: current.fingerprint,
    baselineFingerprint: baseline.fingerprint,
    compatible,
    changes: Object.freeze(changes.sort((left, right) => left.contractId.localeCompare(right.contractId) || left.code.localeCompare(right.code))),
    issues: Object.freeze(issues),
  });
}

export async function checkContractCompatibility(root: string, inventory: ContractInventory, base: string): Promise<ContractCompatibilityResult> {
  try {
    return compareContractManifests(inventory, await loadBaselineManifest(root, base), base);
  } catch (error) {
    const issue: ContractIssue = Object.freeze({
      severity: 'error',
      area: 'compatibility',
      code: 'CONTRACT_BASELINE_UNAVAILABLE',
      file: 'src/generated/contracts/contract-manifest.json',
      message: error instanceof Error ? error.message : String(error),
    });
    return Object.freeze({
      base,
      currentFingerprint: inventory.fingerprint,
      baselineFingerprint: null,
      compatible: false,
      changes: Object.freeze([]),
      issues: Object.freeze([issue]),
    });
  }
}
