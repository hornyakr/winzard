import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultProjectRoots = Object.freeze([
  'apps/reference',
  'templates/minimal',
  'templates/webapp',
] as const);

const releaseStages = new Set(['preview', 'staging', 'production']);
const serverActionEncryptionKeyLine = /^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=[ \t]*$/mu;

const externallyRequiredKeys = Object.freeze([
  'APP_URL',
  'APP_NAME',
  'APP_STAGE',
  'LOG_LEVEL',
  'NEXT_PUBLIC_APP_NAME',
] as const);

export type SetupLocalEnvironmentOptions = Readonly<{
  repositoryRoot?: string;
  environment?: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;
  projectRoots?: readonly string[];
}>;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return String((error as NodeJS.ErrnoException).code);
}

function isContinuousIntegration(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
): boolean {
  return ['1', 'true', 'yes'].includes(String(environment.CI ?? '').trim().toLowerCase());
}

function hasCompleteExternalApplicationEnvironment(
  environment: NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>,
): boolean {
  return externallyRequiredKeys.every((key) => Boolean(environment[key]?.trim()));
}

function localEnvironmentContent(example: string, serverActionEncryptionKey: string): string {
  return example.replace(
    serverActionEncryptionKeyLine,
    `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${serverActionEncryptionKey}`,
  );
}

export async function setupLocalEnvironment(
  options: SetupLocalEnvironmentOptions = {},
): Promise<readonly string[]> {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const environment = options.environment ?? process.env;
  const stage = environment.APP_STAGE?.trim();

  if (
    isContinuousIntegration(environment) ||
    (stage !== undefined && releaseStages.has(stage)) ||
    hasCompleteExternalApplicationEnvironment(environment)
  ) {
    return Object.freeze([]);
  }

  const serverActionEncryptionKey = randomBytes(32).toString('base64');
  const createdFiles: string[] = [];
  for (const projectRoot of options.projectRoots ?? defaultProjectRoots) {
    const examplePath = path.join(repositoryRoot, projectRoot, '.env.example');
    const localPath = path.join(repositoryRoot, projectRoot, '.env.local');
    try {
      const example = await readFile(examplePath, 'utf8');
      await writeFile(
        localPath,
        localEnvironmentContent(example, serverActionEncryptionKey),
        { encoding: 'utf8', flag: 'wx' },
      );
      createdFiles.push(path.relative(repositoryRoot, localPath));
    } catch (error) {
      if (errorCode(error) === 'EEXIST') continue;
      throw error;
    }
  }

  return Object.freeze(createdFiles);
}

async function main(): Promise<void> {
  const createdFiles = await setupLocalEnvironment();
  if (createdFiles.length > 0) {
    process.stdout.write(`Created local environment files: ${createdFiles.join(', ')}\n`);
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to prepare local environment: ${message}\n`);
    process.exitCode = 1;
  });
}
