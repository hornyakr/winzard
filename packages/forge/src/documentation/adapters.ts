import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { WinzardManifest } from '../manifest';
import {
  GENERATED_HEADER,
  contentMatches,
  readOptional,
  sha256,
  writeJsonFile,
  writeTextFile,
} from './generated';
import { assertDocumentationInventoryValid, buildDocumentationInventory } from './inventory';
import { stringArray } from './schema';
import type { CanonicalDocument, DocumentationIssue } from './types';
import { DocumentationCommandError } from './types';

const adapterTargets = [
  ['AGENTS.md', 'Project instructions for coding agents'],
  ['CLAUDE.md', 'Project instructions for Claude Code'],
  ['GEMINI.md', 'Project instructions for Gemini CLI'],
  ['.github/copilot-instructions.md', 'Project instructions for GitHub Copilot'],
] as const;

const selectedSections = new Set([
  'contract',
  'constraints and prohibitions',
  'korlátok és tiltások',
  'security requirements',
  'biztonsági követelmények',
  'acceptance criteria',
  'elfogadási kritériumok',
]);

function sectionProjection(body: string): string {
  const lines = body.replaceAll('\r\n', '\n').split('\n');
  const selected: string[] = [];
  let include = false;
  let activeLevel = 0;

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 0;
      const title = heading[2]?.trim().toLowerCase() ?? '';
      if (selectedSections.has(title)) {
        include = true;
        activeLevel = level;
        selected.push(line);
        continue;
      }
      if (include && level <= activeLevel) include = false;
    }
    if (include) selected.push(line);
  }

  const projected = selected.join('\n').trim();
  if (projected !== '') return projected;
  return body.trim().split(/\n\s*\n/u).slice(0, 2).join('\n\n');
}

function sourceDocuments(documents: readonly CanonicalDocument[]): readonly CanonicalDocument[] {
  return documents
    .filter((document) =>
      document.documentStatus === 'accepted' &&
      (document.authority === 'normative' || document.scope === 'winzard-consumer-contract') &&
      document.aiAccess === 'allowed' &&
      document.contextPriority === 'required')
    .sort((left, right) => left.id.localeCompare(right.id));
}

function sourceBlock(document: CanonicalDocument): string {
  return [
    `## ${document.id} — ${document.title}`,
    '',
    `Source: \`${document.projectPath}\``,
    `Hash: \`${sha256(document.source)}\``,
    '',
    sectionProjection(document.body),
  ].join('\n');
}

function adapterContent(
  title: string,
  projectPrefix: string,
  documents: readonly CanonicalDocument[],
): string {
  const sourceList = documents.length === 0
    ? '- No accepted required contracts were found.'
    : documents.map((document) => `- ${document.id}: ${document.title}`).join('\n');
  const blocks = documents.map(sourceBlock).join('\n\n---\n\n');

  return `${GENERATED_HEADER}\n\n# ${title}\n\nProject prefix: \`${projectPrefix}\`.\n\n## Baseline rules\n\n- Treat canonical project documents and the installed consumer contract as the source of truth.\n- Execute repository changes only from an accepted task brief with a valid base commit and path scope.\n- Do not read or expose secrets, restricted documents, customer data or complete AI chat transcripts.\n- Do not edit generated adapters, context packages or \`docs/80-winzard\` manually.\n- Stop when a forbidden path, destructive operation, security-boundary change or missing human gate becomes necessary.\n- Context access does not grant tool, merge or release permission.\n\n## Source contracts\n\n${sourceList}\n${blocks ? `\n---\n\n${blocks}\n` : ''}`;
}

function instructionSlug(document: CanonicalDocument): string {
  return document.id.toLowerCase().replace(/[^a-z0-9-]+/gu, '-');
}

function pathSpecificContent(document: CanonicalDocument, patterns: readonly string[]): string {
  return `---\napplyTo: ${JSON.stringify(patterns.join(','))}\n---\n\n${GENERATED_HEADER}\n\n# ${document.id} — ${document.title}\n\nSource: \`${document.projectPath}\`\nHash: \`${sha256(document.source)}\`\n\n${sectionProjection(document.body)}\n`;
}

async function resolveExpectedAiAdapters(
  root: string,
  manifest: WinzardManifest,
  requireValidInventory: boolean,
): Promise<ReadonlyMap<string, string>> {
  if (!manifest.documentation) {
    throw new DocumentationCommandError('DOCUMENTATION_MANIFEST_MISSING', 'Az AI adapterekhez documentation manifest szükséges.');
  }
  const inventory = await buildDocumentationInventory(root, manifest.documentation.projectPrefix);
  if (requireValidInventory) {
    assertDocumentationInventoryValid(inventory, 'Az AI adapter generálása');
  }
  const documents = sourceDocuments(inventory.documents);
  const output = new Map<string, string>();

  for (const [file, title] of adapterTargets) {
    output.set(file, adapterContent(title, manifest.documentation.projectPrefix, documents));
  }

  for (const document of documents) {
    const patterns = stringArray(document.metadata, 'applies_to').filter((pattern) => pattern !== '*' && pattern !== '**');
    if (patterns.length === 0) continue;
    output.set(
      `.github/instructions/${instructionSlug(document)}.instructions.md`,
      pathSpecificContent(document, patterns),
    );
  }

  return output;
}

export async function expectedAiAdapters(
  root: string,
  manifest: WinzardManifest,
): Promise<ReadonlyMap<string, string>> {
  return resolveExpectedAiAdapters(root, manifest, true);
}

async function assertGeneratedOrMissing(filePath: string, projectPath: string): Promise<void> {
  const existing = await readOptional(filePath);
  if (existing !== null && !existing.includes('Generated by Winzard Forge.')) {
    throw new DocumentationCommandError(
      'DOC_ADAPTER_MANUAL_CONTENT',
      `A generátor nem ír felül kézzel karbantartott instrukciós fájlt: ${projectPath}.`,
      projectPath,
    );
  }
}

async function generatedInstructionFiles(root: string): Promise<readonly string[]> {
  const directory = path.join(root, '.github/instructions');
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.instructions.md'))
      .map((entry) => `.github/instructions/${entry.name}`)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function generateAiAdapters(
  root: string,
  manifest: WinzardManifest,
): Promise<readonly string[]> {
  const expected = await expectedAiAdapters(root, manifest);
  const expectedNames = new Set(expected.keys());
  const written: string[] = [];

  for (const [relative, content] of expected) {
    await assertGeneratedOrMissing(path.join(root, relative), relative);
    await writeTextFile(path.join(root, relative), content);
    written.push(relative);
  }

  for (const relative of await generatedInstructionFiles(root)) {
    if (expectedNames.has(relative)) continue;
    const filePath = path.join(root, relative);
    const existing = await readOptional(filePath);
    if (existing?.includes('Generated by Winzard Forge.')) await rm(filePath, { force: true });
  }

  await mkdir(path.join(root, 'docs/_system'), { recursive: true });
  await writeJsonFile(path.join(root, 'docs/_system/adapter-state.json'), {
    schemaVersion: 1,
    files: [...expected.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([file, content]) => ({ file, sha256: sha256(content) })),
  });
  return written;
}

export async function checkAiAdapters(
  root: string,
  manifest: WinzardManifest,
): Promise<readonly DocumentationIssue[]> {
  const expected = await resolveExpectedAiAdapters(root, manifest, false);
  const issues: DocumentationIssue[] = [];
  const expectedNames = new Set(expected.keys());

  for (const [relative, content] of expected) {
    if (!(await contentMatches(path.join(root, relative), content))) {
      issues.push({
        code: 'DOC_GENERATED_DRIFT',
        severity: 'error',
        file: relative,
        message: 'Az AI instrukciós adapter hiányzik vagy eltér a kanonikus project contracttól.',
      });
    }
  }

  for (const relative of await generatedInstructionFiles(root)) {
    if (!expectedNames.has(relative)) {
      issues.push({
        code: 'DOC_GENERATED_DRIFT',
        severity: 'error',
        file: relative,
        message: 'Elavult, már nem generálandó path-specifikus AI adapter található.',
      });
    }
  }

  const state = `${JSON.stringify({
    schemaVersion: 1,
    files: [...expected.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([file, content]) => ({ file, sha256: sha256(content) })),
  }, null, 2)}
`;
  if (!(await contentMatches(path.join(root, 'docs/_system/adapter-state.json'), state))) {
    issues.push({
      code: 'DOC_GENERATED_DRIFT',
      severity: 'error',
      file: 'docs/_system/adapter-state.json',
      message: 'Az AI adapter state fájlja hiányzik vagy elavult.',
    });
  }

  return issues;
}
