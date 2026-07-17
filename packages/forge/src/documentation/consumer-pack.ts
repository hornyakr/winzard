import { access, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WinzardManifest } from '../manifest';
import { parseMarkdownDocument } from './frontmatter';
import {
  GENERATED_HEADER,
  contentMatches,
  normalizeText,
  sha256,
  writeJsonFile,
  writeTextFile,
} from './generated';
import {
  DOCUMENTATION_CONTRACT_VERSION,
  FORGE_DOCUMENTATION_GENERATOR_VERSION,
  normalizeCanonicalDocument,
} from './schema';
import type { DocumentationIssue } from './types';
import { DocumentationCommandError } from './types';

const defaultSourceDirectory = fileURLToPath(
  new URL('../../assets/consumer-contract', import.meta.url),
);

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory: string, prefix = ''): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(target, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

async function detectWinzardVersion(root: string, fallback: string): Promise<string> {
  try {
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    for (const container of [packageJson.dependencies, packageJson.devDependencies]) {
      for (const packageName of ['winzard-forge', '@winzard/forge']) {
        const value = container?.[packageName];
        if (typeof value === 'string' && value.trim() !== '') return value.trim();
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return fallback;
}

function manifestDocument(title: string, body: string): string {
  return `${GENERATED_HEADER}\n\n# ${title}\n\n${body.trim()}\n`;
}

const allowedSourceRoots = [
  'platform-contracts/',
  'compatibility/',
  'upgrade-guides/',
] as const;

async function validatedConsumerSource(
  sourceDirectory: string,
): Promise<ReadonlyMap<string, string>> {
  const output = new Map<string, string>();
  const ids = new Set<string>();

  for (const relative of await collectFiles(sourceDirectory)) {
    if (
      !relative.endsWith('.md') ||
      !allowedSourceRoots.some((prefix) => relative.startsWith(prefix))
    ) {
      throw new DocumentationCommandError(
        'DOC_CONSUMER_SOURCE_INVALID',
        `A consumer contract forrása csak publikus Markdown contractot tartalmazhat: ${relative}.`,
        relative,
      );
    }

    const source = normalizeText(await readFile(path.join(sourceDirectory, relative), 'utf8'));
    const deployedPath = `docs/80-winzard/${relative}`;
    let normalized;
    try {
      const parsed = parseMarkdownDocument(source, path.join(sourceDirectory, relative), deployedPath);
      normalized = normalizeCanonicalDocument(parsed, 'PROJECT');
    } catch (error) {
      throw new DocumentationCommandError(
        'DOC_CONSUMER_SOURCE_INVALID',
        `A consumer contract forrása nem parse-olható: ${error instanceof Error ? error.message : String(error)}.`,
        relative,
      );
    }
    const firstError = normalized.issues.find(({ severity }) => severity === 'error');
    if (!normalized.document || firstError) {
      throw new DocumentationCommandError(
        firstError?.code ?? 'DOC_CONSUMER_SOURCE_INVALID',
        firstError?.message ?? 'A consumer contract forrása nem kanonikus dokumentum.',
        relative,
      );
    }
    if (
      !normalized.document.id.startsWith('WZ-') ||
      normalized.document.scope !== 'winzard-consumer-contract' ||
      normalized.document.classification !== 'public' ||
      normalized.document.aiAccess !== 'allowed'
    ) {
      throw new DocumentationCommandError(
        'DOC_CONSUMER_SOURCE_INVALID',
        'A consumer contract dokumentuma WZ- azonosítót, public besorolást, allowed AI-hozzáférést és winzard-consumer-contract scope-ot igényel.',
        relative,
      );
    }
    if (ids.has(normalized.document.id)) {
      throw new DocumentationCommandError(
        'DOC_ID_DUPLICATE',
        `Duplikált consumer contract ID: ${normalized.document.id}.`,
        relative,
      );
    }
    if (
      /obsidian:\/\/open\?vault=winzard-core/iu.test(source) ||
      /(?:\.\.\/){2,}(?:packages\/forge|docs\/(?:adr|development)|apps\/reference)\//u.test(source) ||
      /github\.com\/[^/]+\/winzard\/(?:blob|tree)\/[^/]+\/(?:packages\/forge|docs\/(?:adr|development)|apps\/reference)\//u.test(source)
    ) {
      throw new DocumentationCommandError(
        'DOC_INTERNAL_PLATFORM_REFERENCE',
        'A consumer contract forrása belső Winzard repository- vagy vault-hivatkozást tartalmaz.',
        relative,
      );
    }

    ids.add(normalized.document.id);
    output.set(relative, source);
  }

  return output;
}

export type ConsumerPackOptions = Readonly<{
  sourceDirectory?: string;
}>;

export async function expectedConsumerPack(
  root: string,
  manifest: WinzardManifest,
  options: ConsumerPackOptions = {},
): Promise<ReadonlyMap<string, string>> {
  if (!manifest.documentation) {
    throw new DocumentationCommandError(
      'DOCUMENTATION_MANIFEST_MISSING',
      'A consumer pack használatához documentation manifest szükséges.',
    );
  }

  const sourceDirectory = options.sourceDirectory ?? defaultSourceDirectory;
  const files = new Map(await validatedConsumerSource(sourceDirectory));

  const winzardVersion = await detectWinzardVersion(
    root,
    manifest.documentation.consumerContractVersion,
  );
  files.set(
    'manifest/winzard-version.md',
    manifestDocument(
      'Installed Winzard version',
      `\`\`\`text\n${winzardVersion}\n\`\`\`\n\nGenerator: ${FORGE_DOCUMENTATION_GENERATOR_VERSION}.`,
    ),
  );
  files.set(
    'manifest/documentation-contract-version.md',
    manifestDocument(
      'Documentation contract version',
      `\`\`\`text\n${DOCUMENTATION_CONTRACT_VERSION}\n\`\`\``,
    ),
  );

  const sourceFiles = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([file, content]) => ({ file, sha256: sha256(content) }));
  const sourceManifest = {
    schemaVersion: 1,
    consumerContractVersion: manifest.documentation.consumerContractVersion,
    documentationContractVersion: DOCUMENTATION_CONTRACT_VERSION,
    generatorVersion: FORGE_DOCUMENTATION_GENERATOR_VERSION,
    files: sourceFiles,
  };
  files.set('manifest/source-manifest.json', `${JSON.stringify(sourceManifest, null, 2)}\n`);
  files.set(
    'manifest/source-manifest.md',
    manifestDocument(
      'Consumer documentation source manifest',
      `The machine-readable manifest is [source-manifest.json](./source-manifest.json).\n\nFiles: ${sourceFiles.length}.`,
    ),
  );

  return files;
}

async function assertReplaceablePack(packRoot: string): Promise<void> {
  if (!(await exists(packRoot))) return;
  for (const relative of await collectFiles(packRoot)) {
    const generatedJson = relative === 'manifest/source-manifest.json';
    const generatedMarkdown = relative.endsWith('.md') &&
      (await readFile(path.join(packRoot, relative), 'utf8')).includes('Generated by Winzard Forge.');
    if (!generatedJson && !generatedMarkdown) {
      throw new DocumentationCommandError(
        'DOC_CONSUMER_PACK_MANUAL_CONTENT',
        `A consumer pack nem generált fájlt tartalmaz, ezért nem írható felül: ${relative}.`,
        `docs/80-winzard/${relative}`,
      );
    }
  }
}

export async function syncConsumerDocumentationPack(
  root: string,
  manifest: WinzardManifest,
  options: ConsumerPackOptions = {},
): Promise<readonly string[]> {
  const expected = await expectedConsumerPack(root, manifest, options);
  const packRoot = path.join(root, 'docs/80-winzard');
  await assertReplaceablePack(packRoot);
  await rm(packRoot, { recursive: true, force: true });
  await mkdir(packRoot, { recursive: true });

  const written: string[] = [];
  for (const [relative, content] of expected) {
    await writeTextFile(path.join(packRoot, relative), content);
    written.push(`docs/80-winzard/${relative}`);
  }
  await writeJsonFile(path.join(root, 'docs/_system/consumer-pack-state.json'), {
    schemaVersion: 1,
    generatorVersion: FORGE_DOCUMENTATION_GENERATOR_VERSION,
    files: [...expected.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([file, content]) => ({ file, sha256: sha256(content) })),
  });
  return written;
}

export async function checkConsumerDocumentationPack(
  root: string,
  manifest: WinzardManifest,
  options: ConsumerPackOptions = {},
): Promise<readonly DocumentationIssue[]> {
  const expected = await expectedConsumerPack(root, manifest, options);
  const packRoot = path.join(root, 'docs/80-winzard');
  const issues: DocumentationIssue[] = [];
  const actual = (await exists(packRoot)) ? await collectFiles(packRoot) : [];
  const expectedNames = new Set(expected.keys());

  for (const [relative, content] of expected) {
    if (!(await contentMatches(path.join(packRoot, relative), content))) {
      issues.push({
        code: 'DOC_GENERATED_DRIFT',
        severity: 'error',
        file: `docs/80-winzard/${relative}`,
        message: 'A consumer documentation pack hiányzik vagy eltér a telepített publikus contracttól.',
      });
    }
  }

  for (const relative of actual) {
    if (!expectedNames.has(relative)) {
      issues.push({
        code: 'DOC_GENERATED_DRIFT',
        severity: 'error',
        file: `docs/80-winzard/${relative}`,
        message: 'Ismeretlen fájl található a generált consumer documentation packben.',
      });
    }
  }

  const expectedState = `${JSON.stringify({
    schemaVersion: 1,
    generatorVersion: FORGE_DOCUMENTATION_GENERATOR_VERSION,
    files: [...expected.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([file, content]) => ({ file, sha256: sha256(content) })),
  }, null, 2)}
`;
  if (!(await contentMatches(path.join(root, 'docs/_system/consumer-pack-state.json'), expectedState))) {
    issues.push({
      code: 'DOC_GENERATED_DRIFT',
      severity: 'error',
      file: 'docs/_system/consumer-pack-state.json',
      message: 'A consumer pack generálási state fájlja hiányzik vagy elavult.',
    });
  }

  return issues;
}
