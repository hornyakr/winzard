import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseDotenv } from 'dotenv';

import type {
  ConfigurationSource,
  EnvironmentSnapshot,
  EnvironmentSnapshotIssue,
} from './types';

const STANDARD_NODE_ENVIRONMENTS = new Set(['development', 'production', 'test']);
const REFERENCE_PATTERN = /(?<!\\)\$(?:\{([A-Za-z_][A-Za-z0-9_]*)(?:(:-|-)([^}]*))?\}|([A-Za-z_][A-Za-z0-9_]*))/gu;

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function expandDotenv(
  parsed: Readonly<Record<string, string>>,
  inherited: Readonly<Record<string, string | undefined>>,
  file: string,
): Readonly<{ values: Record<string, string>; issues: readonly EnvironmentSnapshotIssue[] }> {
  const resolved: Record<string, string> = {};
  const issues: EnvironmentSnapshotIssue[] = [];

  const resolve = (key: string, stack: readonly string[]): string | undefined => {
    if (inherited[key] !== undefined) return inherited[key];
    if (resolved[key] !== undefined) return resolved[key];
    const raw = parsed[key];
    if (raw === undefined) return undefined;
    if (stack.includes(key)) {
      issues.push({
        code: 'CONFIG_ENV_EXPANSION_CYCLE',
        file,
        key,
        message: `Környezeti változóexpanziós ciklus: ${[...stack, key].join(' -> ')}.`,
      });
      return '';
    }

    const expanded = raw.replace(
      REFERENCE_PATTERN,
      (_match, bracedName: string | undefined, operator: string | undefined, fallback: string | undefined, plainName: string | undefined) => {
        const referencedKey = bracedName ?? plainName ?? '';
        const value = resolve(referencedKey, [...stack, key]);
        if (operator === ':-') return value === undefined || value === '' ? fallback ?? '' : value;
        if (operator === '-') return value === undefined ? fallback ?? '' : value;
        return value ?? '';
      },
    ).replaceAll('\\$', '$');
    resolved[key] = expanded;
    return expanded;
  };

  for (const key of Object.keys(parsed)) resolve(key, []);
  return { values: resolved, issues };
}

export type LoadEnvironmentOptions = Readonly<{
  nodeEnv?: string;
  processEnvironment?: Readonly<Record<string, string | undefined>>;
}>;

export function dotenvFileOrder(nodeEnv: string): readonly string[] {
  return [
    `.env.${nodeEnv}.local`,
    ...(nodeEnv === 'test' ? [] : ['.env.local']),
    `.env.${nodeEnv}`,
    '.env',
  ];
}

export async function loadEnvironmentSnapshot(
  root: string,
  options: LoadEnvironmentOptions = {},
): Promise<EnvironmentSnapshot> {
  const processEnvironment = options.processEnvironment ?? process.env;
  const nodeEnv = options.nodeEnv ?? processEnvironment.NODE_ENV ?? 'development';
  const issues: EnvironmentSnapshotIssue[] = [];
  if (!STANDARD_NODE_ENVIRONMENTS.has(nodeEnv)) {
    issues.push({
      code: 'CONFIG_NODE_ENV_INVALID',
      file: 'process.env',
      key: 'NODE_ENV',
      message: `A NODE_ENV csak development, production vagy test lehet; kapott érték: ${nodeEnv}.`,
    });
  }

  const values: Record<string, string | undefined> = { ...processEnvironment };
  const sources = new Map<string, ConfigurationSource>();
  for (const [key, value] of Object.entries(processEnvironment)) {
    if (value !== undefined) {
      sources.set(key, { kind: 'process.env', label: 'process.env', precedence: 0 });
    }
  }

  const loadedFiles: string[] = [];
  const files = dotenvFileOrder(nodeEnv);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index] ?? '';
    const source = await readOptionalFile(path.join(root, file));
    if (source === null) continue;
    loadedFiles.push(file);
    const parsed = parseDotenv(source);
    const expanded = expandDotenv(parsed, values, file);
    issues.push(...expanded.issues);
    for (const [key, value] of Object.entries(expanded.values)) {
      if (values[key] !== undefined) continue;
      values[key] = value;
      sources.set(key, { kind: 'dotenv', label: file, file, precedence: index + 1 });
    }
  }

  return {
    nodeEnv,
    values: Object.freeze(values),
    sources,
    loadedFiles: Object.freeze(loadedFiles),
    issues: Object.freeze(issues),
  };
}

export async function loadExplicitEnvironmentFile(
  root: string,
  fileOrStage: string,
): Promise<EnvironmentSnapshot> {
  const candidate = path.isAbsolute(fileOrStage) || fileOrStage.includes('/') || fileOrStage.includes('\\') || fileOrStage.startsWith('.')
    ? fileOrStage
    : `.env.${fileOrStage}`;
  const filePath = path.resolve(root, candidate);
  const relative = path.relative(path.resolve(root), filePath);
  const label = relative.split(path.sep).join('/');
  const issues: EnvironmentSnapshotIssue[] = [];
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    issues.push({
      code: 'CONFIG_SOURCE_FILE_OUTSIDE_PROJECT',
      file: label,
      message: 'A konfigurációs snapshot fájl nem mutathat a projektgyökéren kívülre.',
    });
    return {
      nodeEnv: 'production',
      values: Object.freeze({}),
      sources: new Map(),
      loadedFiles: [],
      issues,
    };
  }
  const source = await readOptionalFile(filePath);
  if (source === null) {
    issues.push({
      code: 'CONFIG_SOURCE_FILE_MISSING',
      file: label,
      message: `A konfigurációs snapshot fájl nem található: ${label}.`,
    });
    return {
      nodeEnv: 'production',
      values: Object.freeze({}),
      sources: new Map(),
      loadedFiles: [],
      issues,
    };
  }
  const parsed = parseDotenv(source);
  const expanded = expandDotenv(parsed, {}, label);
  const sources = new Map<string, ConfigurationSource>();
  for (const key of Object.keys(expanded.values)) {
    sources.set(key, { kind: 'dotenv', label, file: label, precedence: 0 });
  }
  return {
    nodeEnv: 'production',
    values: Object.freeze(expanded.values),
    sources,
    loadedFiles: [label],
    issues: expanded.issues,
  };
}
