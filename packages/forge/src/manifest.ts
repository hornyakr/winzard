import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const knownCapabilities = [
  'next-app',
  'forge',
  'modular-application',
  'liveness',
  'prisma-postgresql',
  'database-readiness',
  'authentication',
  'forge-development',
  'templates',
  'reference-app',
] as const;

export type WinzardCapability = (typeof knownCapabilities)[number];

export type WinzardManifest = Readonly<{
  schemaVersion: 1;
  profile: string;
  capabilities: readonly WinzardCapability[];
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

export async function loadProjectManifest(root: string): Promise<ManifestResult> {
  const dedicatedFile = path.join(root, 'winzard.json');
  const dedicated = await readJson(dedicatedFile);
  let sourceFile = 'winzard.json';
  let raw = dedicated;

  if (raw === null) {
    sourceFile = 'package.json';
    const packageJson = await readJson(path.join(root, sourceFile));
    raw = isRecord(packageJson) ? packageJson.winzard ?? null : null;
  }

  if (!isRecord(raw)) {
    return {
      manifest: null,
      sourceFile: null,
      failures: [{
        code: 'MANIFEST_MISSING',
        file: sourceFile,
        message: 'A projektből hiányzik a winzard.json vagy a package.json#winzard manifest.',
      }],
    };
  }

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

  if (failures.length > 0) return { manifest: null, sourceFile, failures };

  return {
    manifest: {
      schemaVersion: 1,
      profile: (raw.profile as string).trim(),
      capabilities: Object.freeze(capabilities),
    },
    sourceFile,
    failures: [],
  };
}
