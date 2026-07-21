import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_CONTEXT_BUDGET_BYTES, DOCUMENTATION_CONTRACT_VERSION } from './documentation/schema';

export const knownCapabilities = [
  'next-app',
  'http-kernel',
  'forge',
  'presentation-contract',
  'modular-application',
  'liveness',
  'prisma-postgresql',
  'database-readiness',
  'authentication',
  'project-documentation',
  'ai-delivery',
  'forge-development',
  'templates',
  'reference-app',
] as const;

export type WinzardCapability = (typeof knownCapabilities)[number];

export type WinzardDocumentationManifest = Readonly<{
  contractVersion: 1;
  projectPrefix: string;
  consumerContractVersion: string;
  contextBudgetBytes: number;
}>;

export type WinzardCapabilityConfiguration = Readonly<
  Record<string, Readonly<Record<string, unknown>>>
>;

export type WinzardManifest = Readonly<{
  schemaVersion: 1;
  profile: string;
  capabilities: readonly WinzardCapability[];
  documentation: WinzardDocumentationManifest | null;
  capabilityConfig?: WinzardCapabilityConfiguration;
}>;

export type ManifestFailure = Readonly<{
  code: string;
  file: string;
  message: string;
}>;

export type ManifestResult = Readonly<{
  manifest: WinzardManifest | null;
  sourceFile: string | null;
  failures: readonly ManifestFailure[];
}>;

type ManifestSource = Readonly<{
  sourceFile: 'winzard.json' | 'package.json';
  wrapper: Record<string, unknown>;
  rawManifest: Record<string, unknown>;
}>;

type JsonReadResult = Readonly<{
  exists: boolean;
  value: unknown | null;
  error: ManifestFailure | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(filePath: string, projectFile: string): Promise<JsonReadResult> {
  let source: string;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, value: null, error: null };
    }
    throw error;
  }
  try {
    return { exists: true, value: JSON.parse(source) as unknown, error: null };
  } catch (error) {
    return {
      exists: true,
      value: null,
      error: {
        code: 'MANIFEST_JSON_INVALID',
        file: projectFile,
        message: `A JSON nem parse-olható: ${error instanceof Error ? error.message : String(error)}.`,
      },
    };
  }
}

async function readManifestSource(
  root: string,
): Promise<Readonly<{ source: ManifestSource | null; failures: readonly ManifestFailure[] }>> {
  const [dedicated, packageJson] = await Promise.all([
    readJson(path.join(root, 'winzard.json'), 'winzard.json'),
    readJson(path.join(root, 'package.json'), 'package.json'),
  ]);
  const failures: ManifestFailure[] = [dedicated.error, packageJson.error]
    .filter((value): value is ManifestFailure => value !== null);

  const dedicatedManifest = dedicated.exists && dedicated.error === null
    ? dedicated.value
    : null;
  if (dedicated.exists && dedicated.error === null && !isRecord(dedicatedManifest)) {
    failures.push({
      code: 'MANIFEST_INVALID',
      file: 'winzard.json',
      message: 'A winzard.json gyökere objektum legyen.',
    });
  }

  const packageWrapper = packageJson.exists && packageJson.error === null && isRecord(packageJson.value)
    ? packageJson.value
    : null;
  if (packageJson.exists && packageJson.error === null && !isRecord(packageJson.value)) {
    failures.push({
      code: 'MANIFEST_INVALID',
      file: 'package.json',
      message: 'A package.json gyökere objektum legyen.',
    });
  }
  const packageManifest = packageWrapper?.winzard;
  if (packageManifest !== undefined && !isRecord(packageManifest)) {
    failures.push({
      code: 'MANIFEST_INVALID',
      file: 'package.json',
      message: 'A package.json#winzard értéke objektum legyen.',
    });
  }

  const hasDedicated = isRecord(dedicatedManifest);
  const hasPackage = isRecord(packageManifest);
  if (hasDedicated && hasPackage) {
    failures.push({
      code: 'MANIFEST_AMBIGUOUS',
      file: 'winzard.json | package.json',
      message: 'Pontosan egy manifestforrás támogatott; a winzard.json és a package.json#winzard nem használható egyszerre.',
    });
  }
  if (failures.length > 0) return { source: null, failures };
  if (hasDedicated) {
    return {
      source: {
        sourceFile: 'winzard.json',
        wrapper: dedicatedManifest,
        rawManifest: dedicatedManifest,
      },
      failures: [],
    };
  }
  if (hasPackage && packageWrapper) {
    return {
      source: {
        sourceFile: 'package.json',
        wrapper: packageWrapper,
        rawManifest: packageManifest,
      },
      failures: [],
    };
  }
  return { source: null, failures: [] };
}

function validateUnknownFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  sourceFile: string,
  code: string,
  failures: ManifestFailure[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      failures.push({
        code,
        file: sourceFile,
        message: `Ismeretlen manifestmező: ${key}.`,
      });
    }
  }
}

function freezeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJsonValue));
  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, freezeJsonValue(item)]),
    ));
  }
  return value;
}

function validateCapabilityConfig(
  raw: unknown,
  sourceFile: string,
  capabilities: readonly WinzardCapability[],
  failures: ManifestFailure[],
): WinzardCapabilityConfiguration | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    failures.push({
      code: 'MANIFEST_CAPABILITY_CONFIG',
      file: sourceFile,
      message: 'A capabilityConfig mező objektum legyen.',
    });
    return undefined;
  }

  const activeCapabilities = new Set(capabilities);
  const output: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [capability, value] of Object.entries(raw)) {
    if (!knownCapabilities.includes(capability as WinzardCapability)) {
      failures.push({
        code: 'MANIFEST_CAPABILITY_CONFIG_UNKNOWN',
        file: sourceFile,
        message: `Ismeretlen capabilityConfig blokk: ${capability}.`,
      });
      continue;
    }
    if (!activeCapabilities.has(capability as WinzardCapability)) {
      failures.push({
        code: 'MANIFEST_CAPABILITY_CONFIG_INACTIVE',
        file: sourceFile,
        message: `A capabilityConfig csak aktív capability-hez tartozhat: ${capability}.`,
      });
      continue;
    }
    if (!isRecord(value)) {
      failures.push({
        code: 'MANIFEST_CAPABILITY_CONFIG',
        file: sourceFile,
        message: `A ${capability} capabilityConfig blokk objektum legyen.`,
      });
      continue;
    }
    output[capability] = freezeJsonValue(value) as Readonly<Record<string, unknown>>;
  }
  return Object.freeze(output);
}

function validateDocumentation(
  raw: unknown,
  sourceFile: string,
  required: boolean,
  failures: ManifestFailure[],
): WinzardDocumentationManifest | null {
  if (!isRecord(raw)) {
    if (required) {
      failures.push({
        code: 'DOCUMENTATION_MANIFEST_MISSING',
        file: sourceFile,
        message: 'A dokumentációs capability-khez kötelező a winzard.documentation konfiguráció.',
      });
    }
    return null;
  }
  validateUnknownFields(
    raw,
    new Set(['contractVersion', 'projectPrefix', 'consumerContractVersion', 'contextBudgetBytes']),
    sourceFile,
    'DOCUMENTATION_MANIFEST_UNKNOWN_FIELD',
    failures,
  );

  if (raw.contractVersion !== DOCUMENTATION_CONTRACT_VERSION) {
    failures.push({
      code: 'DOCUMENTATION_CONTRACT_VERSION',
      file: sourceFile,
      message: `Csak a ${DOCUMENTATION_CONTRACT_VERSION}-es dokumentációs contract támogatott.`,
    });
  }

  const projectPrefix = typeof raw.projectPrefix === 'string' ? raw.projectPrefix.trim().toUpperCase() : '';
  if (!/^[A-Z][A-Z0-9]{1,11}$/u.test(projectPrefix)) {
    failures.push({
      code: 'DOCUMENTATION_PROJECT_PREFIX',
      file: sourceFile,
      message: 'A documentation.projectPrefix 2–12 karakteres, nagybetűs, alfanumerikus érték legyen.',
    });
  }

  const consumerContractVersion = typeof raw.consumerContractVersion === 'string'
    ? raw.consumerContractVersion.trim()
    : '';
  if (consumerContractVersion === '') {
    failures.push({
      code: 'DOCUMENTATION_CONSUMER_CONTRACT_VERSION',
      file: sourceFile,
      message: 'A documentation.consumerContractVersion nem lehet üres.',
    });
  }

  const contextBudgetBytes = raw.contextBudgetBytes === undefined
    ? DEFAULT_CONTEXT_BUDGET_BYTES
    : raw.contextBudgetBytes;
  if (!Number.isInteger(contextBudgetBytes) || Number(contextBudgetBytes) < 16_384) {
    failures.push({
      code: 'DOCUMENTATION_CONTEXT_BUDGET',
      file: sourceFile,
      message: 'A documentation.contextBudgetBytes legalább 16384 értékű egész szám legyen.',
    });
  }

  if (failures.some(({ code }) => code.startsWith('DOCUMENTATION_'))) return null;
  return {
    contractVersion: DOCUMENTATION_CONTRACT_VERSION,
    projectPrefix,
    consumerContractVersion,
    contextBudgetBytes: Number(contextBudgetBytes),
  };
}

export async function loadProjectManifest(root: string): Promise<ManifestResult> {
  const sourceResult = await readManifestSource(root);
  if (sourceResult.failures.length > 0) {
    return { manifest: null, sourceFile: null, failures: sourceResult.failures };
  }
  const source = sourceResult.source;
  if (!source) {
    return {
      manifest: null,
      sourceFile: null,
      failures: [{
        code: 'MANIFEST_MISSING',
        file: 'winzard.json | package.json',
        message: 'A projektből hiányzik a winzard.json vagy a package.json#winzard manifest.',
      }],
    };
  }

  const { rawManifest: raw, sourceFile } = source;
  const failures: ManifestFailure[] = [];
  validateUnknownFields(
    raw,
    new Set(['schemaVersion', 'profile', 'capabilities', 'documentation', 'capabilityConfig']),
    sourceFile,
    'MANIFEST_UNKNOWN_FIELD',
    failures,
  );
  if (raw.schemaVersion !== 1) {
    failures.push({ code: 'MANIFEST_SCHEMA_VERSION', file: sourceFile, message: 'Csak az 1-es manifest schema támogatott.' });
  }
  if (typeof raw.profile !== 'string' || raw.profile.trim().length === 0) {
    failures.push({ code: 'MANIFEST_PROFILE', file: sourceFile, message: 'A manifest profile mezője nem üres string legyen.' });
  }
  if (!Array.isArray(raw.capabilities)) {
    failures.push({ code: 'MANIFEST_CAPABILITIES', file: sourceFile, message: 'A capabilities mező tömb legyen.' });
  }

  const capabilities: WinzardCapability[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.capabilities)) {
    for (const capability of raw.capabilities) {
      if (typeof capability !== 'string' || !knownCapabilities.includes(capability as WinzardCapability)) {
        failures.push({ code: 'CAPABILITY_UNKNOWN', file: sourceFile, message: `Ismeretlen capability: ${String(capability)}` });
        continue;
      }
      if (seen.has(capability)) {
        failures.push({ code: 'CAPABILITY_DUPLICATE', file: sourceFile, message: `Duplikált capability: ${capability}` });
        continue;
      }
      seen.add(capability);
      capabilities.push(capability as WinzardCapability);
    }
  }

  const capabilityConfig = validateCapabilityConfig(
    raw.capabilityConfig,
    sourceFile,
    capabilities,
    failures,
  );
  const documentationRequired = capabilities.includes('project-documentation') || capabilities.includes('ai-delivery');
  const documentation = validateDocumentation(raw.documentation, sourceFile, documentationRequired, failures);
  if (raw.documentation !== undefined && !documentationRequired) {
    failures.push({
      code: 'DOCUMENTATION_MANIFEST_ORPHAN',
      file: sourceFile,
      message: 'A documentation blokk csak project-documentation vagy ai-delivery capability mellett használható.',
    });
  }

  if (failures.length > 0) return { manifest: null, sourceFile, failures };
  return {
    manifest: {
      schemaVersion: 1,
      profile: (raw.profile as string).trim(),
      capabilities: Object.freeze(capabilities),
      documentation,
      ...(capabilityConfig ? { capabilityConfig } : {}),
    },
    sourceFile,
    failures: [],
  };
}

export type EnableDocumentationOptions = Readonly<{
  projectPrefix: string;
  includeAiDelivery: boolean;
  consumerContractVersion?: string;
  contextBudgetBytes?: number;
}>;

export async function enableDocumentationCapabilities(
  root: string,
  options: EnableDocumentationOptions,
): Promise<'winzard.json' | 'package.json'> {
  const sourceResult = await readManifestSource(root);
  if (sourceResult.failures.length > 0) {
    throw new Error(sourceResult.failures.map(({ message }) => message).join(' '));
  }
  const source = sourceResult.source;
  if (!source) {
    throw new Error('A docs:init futtatásához előbb Winzard manifest szükséges.');
  }

  const capabilities = Array.isArray(source.rawManifest.capabilities)
    ? source.rawManifest.capabilities.filter((item): item is string => typeof item === 'string')
    : [];
  const required = ['project-documentation', ...(options.includeAiDelivery ? ['ai-delivery'] : [])];
  source.rawManifest.capabilities = [...new Set([...capabilities, ...required])];
  source.rawManifest.documentation = {
    contractVersion: DOCUMENTATION_CONTRACT_VERSION,
    projectPrefix: options.projectPrefix.trim().toUpperCase(),
    consumerContractVersion: options.consumerContractVersion ?? '0.1.0',
    contextBudgetBytes: options.contextBudgetBytes ?? DEFAULT_CONTEXT_BUDGET_BYTES,
  };

  const output = source.sourceFile === 'package.json'
    ? { ...source.wrapper, winzard: source.rawManifest }
    : source.rawManifest;
  await writeFile(path.join(root, source.sourceFile), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  return source.sourceFile;
}
