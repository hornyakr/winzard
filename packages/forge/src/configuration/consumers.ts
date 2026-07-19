import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { ConfigurationDefinition } from './types';

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
]);
const IGNORED_DIRECTORIES = new Set([
  '.git', '.next', 'node_modules', 'coverage', 'generated',
]);
const DIRECT_ENVIRONMENT_REFERENCE_PATTERNS = [
  /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/gu,
  /\bprocess\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/gu,
] as const;

const CONFIGURATION_INPUT_REFERENCE_PATTERNS = [
  /\b(?:input|environment|env|configuration)\.([A-Z][A-Z0-9_]*)\b/gu,
  /\b(?:input|environment|env|configuration)\[['"]([A-Z][A-Z0-9_]*)['"]\]/gu,
] as const;

const FRAMEWORK_ENV_KEYS = new Set([
  'NODE_ENV',
  'NEXT_RUNTIME',
  'PORT',
  'HOSTNAME',
  'CI',
  'TZ',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'NEXT_DEPLOYMENT_ID',
  'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
]);

async function collectSourceFiles(directory: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) files.push(...(await collectSourceFiles(target)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(target);
    }
  }
  return files.sort();
}

function projectPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function matchingKeys(
  source: string,
  patterns: readonly RegExp[],
): readonly string[] {
  const keys = new Set<string>();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const key = match[1];
      if (key) keys.add(key);
    }
  }
  return [...keys].sort();
}

function directEnvironmentKeyReferences(source: string): readonly string[] {
  return matchingKeys(source, DIRECT_ENVIRONMENT_REFERENCE_PATTERNS);
}

function configurationInputKeyReferences(source: string): readonly string[] {
  return matchingKeys(source, CONFIGURATION_INPUT_REFERENCE_PATTERNS);
}

function isFrameworkEnvironmentKey(key: string): boolean {
  return FRAMEWORK_ENV_KEYS.has(key) ||
    key.startsWith('GITHUB_') ||
    key.startsWith('npm_') ||
    key.startsWith('PNPM_');
}

export type ConfigurationConsumerInventory = Readonly<{
  consumers: ReadonlyMap<string, readonly string[]>;
  undeclared: Readonly<Record<string, readonly string[]>>;
}>;

export async function collectConfigurationConsumers(
  root: string,
  definitions: readonly ConfigurationDefinition[],
): Promise<ConfigurationConsumerInventory> {
  const known = new Set(definitions.map(({ key }) => key));
  const consumers = new Map<string, Set<string>>();
  const undeclared = new Map<string, Set<string>>();
  const roots = ['src', 'instrumentation.ts', 'next.config.ts', 'next.config.mjs', 'next.config.js', 'prisma.config.ts'];
  const files: string[] = [];

  for (const candidate of roots) {
    const target = path.join(root, candidate);
    if (SOURCE_EXTENSIONS.has(path.extname(candidate))) {
      try {
        await readFile(target, 'utf8');
        files.push(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    } else {
      files.push(...(await collectSourceFiles(target)));
    }
  }

  for (const filePath of [...new Set(files)].sort()) {
    const source = await readFile(filePath, 'utf8');
    const relative = projectPath(root, filePath);
    const directKeys = directEnvironmentKeyReferences(source);
    const knownInputKeys = configurationInputKeyReferences(source).filter((key) => known.has(key));
    for (const key of [...new Set([...directKeys, ...knownInputKeys])].sort()) {
      if (known.has(key)) {
        const filesForKey = consumers.get(key) ?? new Set<string>();
        filesForKey.add(relative);
        consumers.set(key, filesForKey);
      }
    }
    for (const key of directKeys) {
      if (!known.has(key) && !isFrameworkEnvironmentKey(key)) {
        const filesForKey = undeclared.get(key) ?? new Set<string>();
        filesForKey.add(relative);
        undeclared.set(key, filesForKey);
      }
    }
  }

  return {
    consumers: new Map(
      [...consumers.entries()].map(([key, values]) => [key, [...values].sort()]),
    ),
    undeclared: Object.fromEntries(
      [...undeclared.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, values]) => [key, [...values].sort()]),
    ),
  };
}
