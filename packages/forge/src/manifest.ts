import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_CONTEXT_BUDGET_BYTES, DOCUMENTATION_CONTRACT_VERSION } from './documentation/schema';

export const knownCapabilities = [
  'next-app',
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

export type WinzardManifest = Readonly<{
  schemaVersion: 1;
  profile: string;
  capabilities: readonly WinzardCapability[];
  documentation: WinzardDocumentationManifest | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function readManifestSource(root: string): Promise<ManifestSource | null> {
  const dedicated = await readJson(path.join(root, 'winzard.json'));
  if (isRecord(dedicated)) {
    return { sourceFile: 'winzard.json', wrapper: dedicated, rawManifest: dedicated };
  }

  const packageJson = await readJson(path.join(root, 'package.json'));
  if (!isRecord(packageJson) || !isRecord(packageJson.winzard)) return null;
  return {
    sourceFile: 'package.json',
    wrapper: packageJson,
    rawManifest: packageJson.winzard,
  };
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
  const source = await readManifestSource(root);
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

  const documentationRequired = capabilities.includes('project-documentation') || capabilities.includes('ai-delivery');
  const documentation = validateDocumentation(raw.documentation, sourceFile, documentationRequired, failures);

  if (failures.length > 0) return { manifest: null, sourceFile, failures };

  return {
    manifest: {
      schemaVersion: 1,
      profile: (raw.profile as string).trim(),
      capabilities: Object.freeze(capabilities),
      documentation,
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
  const source = await readManifestSource(root);
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
