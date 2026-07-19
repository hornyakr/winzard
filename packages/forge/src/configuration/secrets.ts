import { execFile } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { parse as parseDotenv } from 'dotenv';

import type { ConfigurationIssue } from './types';

const execFileAsync = promisify(execFile);

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.yml', '.yaml', '.toml', '.env', '.txt', '.sh', '.pem', '.key', '.crt', '.cert',
]);
const IGNORED_DIRECTORIES = new Set(['.git', '.next', 'node_modules', 'coverage']);
const COMMITTED_ENV_ALLOWLIST = new Set(['.env.example', '.env.test']);
const SENSITIVE_PUBLIC_KEY = /\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL|DATABASE_URL|AUTH)[A-Z0-9_]*\b/gu;
const RAW_ENV_LOG = /\b(?:console\.(?:log|debug|info|warn|error)|logger\.(?:trace|debug|info|warn|error))\s*\(\s*(?:\{[^)]*\bprocess\.env\b[^)]*\}|process\.env)\s*\)/gu;
const SECRET_FALLBACK = /\bprocess\.env(?:\.([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)|\[['"]([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)['"]\])\s*(?:\?\?|\|\|)\s*(['"`])([^'"`]*?)\3/gu;
const SENSITIVE_ENVIRONMENT_KEY = /(?:SECRET|TOKEN|PASSWORD|PASS|PRIVATE_KEY|CREDENTIAL|DATABASE_URL|DSN|API_KEY)$/u;
const GENERIC_SECRET_ASSIGNMENT = /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*['"]([^'"\n]+)['"]/gu;

const HIGH_CONFIDENCE_PATTERNS: readonly Readonly<{
  code: string;
  expression: RegExp;
  message: string;
}>[] = [
  {
    code: 'CONFIG_SECRET_EXPOSED',
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
    message: 'Privát kulcs került verziózott fájlba.',
  },
  {
    code: 'CONFIG_SECRET_EXPOSED',
    expression: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu,
    message: 'GitHub tokennak megfelelő érték került verziózott fájlba.',
  },
  {
    code: 'CONFIG_SECRET_EXPOSED',
    expression: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/gu,
    message: 'Privát API tokennak megfelelő érték került verziózott fájlba.',
  },
  {
    code: 'CONFIG_SECRET_EXPOSED',
    expression: /\bxox(?:a|b|p|r|s)-[A-Za-z0-9-]{20,}\b/gu,
    message: 'Slack tokennak megfelelő érték került verziózott fájlba.',
  },
  {
    code: 'CONFIG_SECRET_EXPOSED',
    expression: /\bAKIA[0-9A-Z]{16}\b/gu,
    message: 'AWS access key azonosító került verziózott fájlba.',
  },
];

function isCandidateFile(fileName: string): boolean {
  const extension = path.extname(fileName);
  return TEXT_EXTENSIONS.has(extension) ||
    path.basename(fileName).startsWith('.env') ||
    path.basename(fileName) === 'Dockerfile';
}

async function collectGitVisibleFiles(root: string): Promise<readonly string[] | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, maxBuffer: 16 * 1024 * 1024 },
    );
    const files: string[] = [];
    for (const projectFile of stdout.split('\0').filter(Boolean)) {
      if (!isCandidateFile(projectFile)) continue;
      const absolute = path.resolve(root, projectFile);
      const relative = path.relative(root, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
      try {
        if ((await lstat(absolute)).isFile()) files.push(absolute);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return [...new Set(files)].sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || typeof (error as { stderr?: unknown }).stderr === 'string') return null;
    throw error;
  }
}

async function collectFiles(directory: string): Promise<readonly string[]> {
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
      if (!IGNORED_DIRECTORIES.has(entry.name)) files.push(...(await collectFiles(target)));
    } else if (entry.isFile() && isCandidateFile(entry.name)) {
      files.push(target);
    }
  }
  return files.sort();
}

function projectPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function issue(code: string, file: string, message: string, key?: string): ConfigurationIssue {
  return {
    severity: 'error',
    code,
    file,
    ...(key ? { key } : {}),
    message,
  };
}

function safePlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return /^<[^>]+>$/u.test(value.trim()) ||
    normalized.includes('example') ||
    normalized.includes('placeholder') ||
    normalized.includes('development-only') ||
    normalized.includes('dev-only') ||
    normalized.includes('dev_only') ||
    normalized.includes('generate-') ||
    normalized === 'secret' ||
    normalized === 'password';
}

function sourceLike(file: string): boolean {
  return /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|env)$/u.test(file) ||
    file.endsWith('Dockerfile') ||
    path.basename(file).startsWith('.env');
}

function safeEnvironmentSecret(key: string, value: string): boolean {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (trimmed === '' || safePlaceholder(value)) return true;
  if (
    key === 'DATABASE_URL' ||
    key.endsWith('_DATABASE_URL') ||
    key.endsWith('_DSN')
  ) {
    try {
      const url = new URL(value);
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    } catch {
      return false;
    }
  }
  return normalized.startsWith('test-only-') ||
    normalized.startsWith('development-only-') ||
    normalized.includes('dev_only') ||
    normalized.includes('test_only');
}

export async function scanRepositorySecrets(root: string): Promise<readonly ConfigurationIssue[]> {
  const issues: ConfigurationIssue[] = [];
  const files = await collectGitVisibleFiles(root) ?? await collectFiles(root);
  for (const filePath of files) {
    const file = projectPath(root, filePath);
    const base = path.basename(file);
    if (base.startsWith('.env') && !COMMITTED_ENV_ALLOWLIST.has(base)) {
      issues.push(issue(
        'CONFIG_SECRET_FILE_COMMITTED',
        file,
        'Runtime vagy lokális .env fájl nem verziózható; csak .env.example és secretmentes .env.test támogatott.',
      ));
    }

    let source: string;
    try {
      source = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    if (Buffer.byteLength(source, 'utf8') > 2_000_000) continue;

    for (const pattern of HIGH_CONFIDENCE_PATTERNS) {
      pattern.expression.lastIndex = 0;
      if (pattern.expression.test(source)) issues.push(issue(pattern.code, file, pattern.message));
    }

    if (base.startsWith('.env') && COMMITTED_ENV_ALLOWLIST.has(base)) {
      const parsed = parseDotenv(source);
      for (const [key, value] of Object.entries(parsed)) {
        if (SENSITIVE_ENVIRONMENT_KEY.test(key) && !safeEnvironmentSecret(key, value)) {
          issues.push(issue(
            'CONFIG_SECRET_EXPOSED',
            file,
            `${key} valós secretnek tűnő értéket tartalmaz egy verziózott env fixture-ben.`,
            key,
          ));
        }
      }
    }

    if (/^next\.config\.(?:[cm]?[jt]s)$/u.test(base) && /(?:^|[,{\n])\s*env\s*:/u.test(source)) {
      issues.push(issue(
        'CONFIG_NEXT_ENV_FORBIDDEN',
        file,
        'A next.config env opció bundle-be emelhet értékeket; használj explicit server/public konfigurációs contractot.',
      ));
    }

    if (!sourceLike(file) || file.startsWith('docs/')) continue;

    SENSITIVE_PUBLIC_KEY.lastIndex = 0;
    for (const match of source.matchAll(SENSITIVE_PUBLIC_KEY)) {
      issues.push(issue(
        'CONFIG_PUBLIC_SECRET',
        file,
        `Érzékeny jelentésű kulcs nem lehet NEXT_PUBLIC_ konfiguráció: ${match[0]}.`,
        match[0],
      ));
    }

    RAW_ENV_LOG.lastIndex = 0;
    if (RAW_ENV_LOG.test(source)) {
      issues.push(issue(
        'CONFIG_RAW_ENV_LOG',
        file,
        'A teljes process.env objektum naplózása secretkiszivárgást okozhat.',
      ));
    }

    SECRET_FALLBACK.lastIndex = 0;
    for (const match of source.matchAll(SECRET_FALLBACK)) {
      const key = match[1] ?? match[2] ?? '';
      issues.push(issue(
        'CONFIG_DEFAULT_UNSAFE',
        file,
        `${key} csendes literal fallback secretet használ.`,
        key,
      ));
    }

    GENERIC_SECRET_ASSIGNMENT.lastIndex = 0;
    for (const match of source.matchAll(GENERIC_SECRET_ASSIGNMENT)) {
      const key = match[1] ?? '';
      const value = match[2] ?? '';
      if (value.length >= 20 && !safePlaceholder(value)) {
        issues.push(issue(
          'CONFIG_SECRET_EXPOSED',
          file,
          `${key} valós secretnek tűnő literal értéket tartalmaz.`,
          key,
        ));
      }
    }
  }

  const unique = new Map<string, ConfigurationIssue>();
  for (const value of issues) unique.set(`${value.code}:${value.file}:${value.key ?? ''}:${value.message}`, value);
  return [...unique.values()].sort((left, right) =>
    left.file.localeCompare(right.file) || left.code.localeCompare(right.code));
}
